'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5001;

// ── Firebase Admin Setup ───────────────────────────────────────
let fbAdminAuth = null;
try {
  let serviceAccount = null;
  const saPath = path.join(__dirname, 'service-account.json');
  if (fs.existsSync(saPath)) {
    serviceAccount = require(saPath);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  if (serviceAccount) {
    const adminApp = initializeApp({ credential: cert(serviceAccount) });
    fbAdminAuth = getAuth(adminApp);
    console.log('[Firebase Admin] Connected successfully to mass-manajmant');
  }
} catch (e) {
  console.warn('[Firebase Admin] Init warning:', e.message);
}

// ── Gmail SMTP Transporter (Google Servers) ───────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'mdjamanmolla44@gmail.com',
    pass: process.env.SMTP_PASS || 'rsfdljqslmkcbnfg'
  }
});

// Verify SMTP
transporter.verify((err) => {
  if (err) console.error('[SMTP] Verification error:', err.message);
  else console.log('[SMTP] Gmail is ready to send professional OTP emails');
});

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── In-Memory OTP Store ───────────────────────────────────────
const otpStore = new Map(); // email -> { code, expiresAt, attempts }
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ── Clean Up Expired OTPs ─────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiresAt) otpStore.delete(email);
  }
}, 60 * 1000);

// ── Health Check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Track Meal Professional OTP API', timestamp: new Date() });
});

// ── POST /api/send-otp ────────────────────────────────────────
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'সঠিক ইমেইল অ্যাড্রেস প্রদান করুন।' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Generate 6-digit numeric OTP code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(cleanEmail, {
      code,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0
    });

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 1.5px;">TRACK MEAL</h1>
          <p style="color: #e0e7ff; margin: 6px 0 0; font-size: 13px; font-weight: 500;">Mess & Hostel Management Platform</p>
        </div>
        <div style="padding: 32px 28px;">
          <p style="font-size: 16px; color: #1e293b; margin: 0 0 10px; font-weight: 600;">আপনার সিকিউরিটি ভেরিফিকেশন কোড</p>
          <p style="font-size: 14px; color: #64748b; margin: 0 0 24px; line-height: 1.6;">
            Track Meal অ্যাকাউন্টের পাসওয়ার্ড পরিবর্তন বা সুরক্ষার জন্য নিচের ৬ সংখ্যার ওটিপি (OTP) কোডটি ব্যবহার করুন:
          </p>
          <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 22px; text-align: center; margin: 0 0 24px;">
            <div style="font-size: 38px; font-weight: 800; letter-spacing: 12px; color: #4f46e5; font-family: monospace; padding-left: 12px;">
              ${code}
            </div>
          </div>
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
            <p style="font-size: 13px; color: #92400e; margin: 0; line-height: 1.5;">
              ⚠️ এই কোডটি <strong>১০ মিনিট</strong> কার্যকর থাকবে। নিরাপত্তার স্বার্থে এই কোডটি কাউকে শেয়ার করবেন না।
            </p>
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center; line-height: 1.5;">
            আপনি যদি এই অনুরোধ না করে থাকেন, তবে নির্দ্বিধায় এই ইমেইলটি উপেক্ষা করুন। আপনার অ্যাকাউন্ট সম্পূর্ণ নিরাপদ আছে।
          </p>
        </div>
        <div style="background: #f8fafc; border-top: 1px solid #f1f5f9; padding: 16px; text-align: center;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">© Track Meal • Bangladesh Mess Management</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: '"Track Meal" <mdjamanmolla44@gmail.com>',
      to: cleanEmail,
      subject: `Track Meal - আপনার ভেরিফিকেশন কোড: ${code}`,
      html: htmlBody
    });

    console.log(`[OTP] Sent code ${code} to ${cleanEmail}`);
    res.json({ success: true, message: 'ভেরিফিকেশন কোড পাঠানো হয়েছে।' });
  } catch (err) {
    console.error('[OTP] Send error:', err.message);
    res.status(500).json({ error: 'ইমেইল পাঠাতে সমস্যা হয়েছে: ' + err.message });
  }
});

// ── POST /api/verify-otp ──────────────────────────────────────
app.post('/api/verify-otp', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'ইমেইল এবং কোড উভয়ই প্রয়োজন।' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const entry = otpStore.get(cleanEmail);

  if (!entry) {
    return res.status(400).json({ error: 'কোনো সক্রিয় কোড পাওয়া যায়নি। পুনরায় কোড পাঠান।' });
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(cleanEmail);
    return res.status(400).json({ error: 'কোডের মেয়াদ শেষ (১০ মিনিট)। পুনরায় কোড পাঠান।' });
  }

  if (entry.attempts >= 5) {
    otpStore.delete(cleanEmail);
    return res.status(400).json({ error: 'অনেকবার ভুল কোড দেওয়া হয়েছে। নতুন কোড পাঠান।' });
  }

  if (entry.code !== String(code).trim()) {
    entry.attempts++;
    const left = 5 - entry.attempts;
    return res.status(400).json({ error: `কোড সঠিক নয়। আর ${left}টি সুযোগ আছে।` });
  }

  // Mark as verified
  entry.verified = true;
  res.json({ success: true, message: 'কোড সফলভাবে যাচাই হয়েছে।' });
});

// ── POST /api/reset-password ──────────────────────────────────
app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'সবগুলো তথ্য পূরণ করুন।' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const entry = otpStore.get(cleanEmail);

    if (!entry || entry.code !== String(code).trim()) {
      return res.status(400).json({ error: 'ভেরিফিকেশন কোডটি সঠিক নয় বা মেয়াদ শেষ।' });
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({ error: 'কোডের মেয়াদ শেষ। পুনরায় চেষ্টা করুন।' });
    }

    if (!fbAdminAuth) {
      return res.status(500).json({ error: 'Firebase Admin পরিষেবা প্রস্তুত নয়।' });
    }

    // Find user in Firebase Auth
    const userRecord = await fbAdminAuth.getUserByEmail(cleanEmail);
    if (!userRecord) {
      return res.status(404).json({ error: 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' });
    }

    // Update password in Firebase Auth directly using Admin SDK!
    await fbAdminAuth.updateUser(userRecord.uid, {
      password: newPassword
    });

    // Clear OTP after successful reset
    otpStore.delete(cleanEmail);
    console.log(`[Password Reset] Password updated successfully for ${cleanEmail}`);

    res.json({ success: true, message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!' });
  } catch (err) {
    console.error('[Password Reset] Error:', err.message);
    if (err.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' });
    }
    res.status(500).json({ error: err.message || 'পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে।' });
  }
});

// ── Start Server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 Track Meal Professional OTP Server running on port ${PORT}`);
  console.log(`=================================================\n`);
});
