// POST /api/send-credentials
// Headers: Authorization: Bearer <Firebase ID token of a signed-in ADMIN>
// Body:    { toEmail, studentName, regNumber, password, className }
// Sends the login details to the parent by Gmail (nodemailer).
//
// Vercel environment variables:
//   GMAIL_USER          the Gmail address that sends the mail
//   GMAIL_APP_PASSWORD  a 16-character Google "App password" (NOT your normal password)
//   ALLOWED_ORIGIN      e.g. https://yourname.github.io
// Optional: SCHOOL_NAME, PORTAL_URL, FIREBASE_API_KEY, FIREBASE_PROJECT_ID

const nodemailer = require('nodemailer');

const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAA4FrgXKF8SDYvS3jnTj8wmyX4AzqZWpU';
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'veil-1-bd7b5';
const SCHOOL = process.env.SCHOOL_NAME || 'Newtown Academy';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Confirms the token is a real Firebase login, then confirms /admins/{uid} exists.
// Firestore's own rules do the admin check, because we call it with the user's token.
async function isAdmin(idToken) {
  const lk = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!lk.ok) return false;
  const lj = await lk.json();
  const uid = lj && lj.users && lj.users[0] && lj.users[0].localId;
  if (!uid) return false;
  const fs = await fetch(
    'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/admins/' + encodeURIComponent(uid),
    { headers: { Authorization: 'Bearer ' + idToken } }
  );
  return fs.status === 200;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return res.status(500).json({ ok: false, message: 'Email not configured on the server' });

  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ ok: false, message: 'Not signed in' });
  try {
    if (!(await isAdmin(m[1]))) return res.status(403).json({ ok: false, message: 'Admins only' });
  } catch (e) {
    return res.status(502).json({ ok: false, message: 'Could not verify login' });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const toEmail = String(b.toEmail || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail) || toEmail.length > 200) {
    return res.status(400).json({ ok: false, message: 'Invalid parent email' });
  }
  const studentName = String(b.studentName || '').slice(0, 120);
  const regNumber = String(b.regNumber || '').slice(0, 60);
  const password = String(b.password || '').slice(0, 100);
  const className = String(b.className || '').slice(0, 60);
  if (!regNumber || !password) return res.status(400).json({ ok: false, message: 'Missing login details' });

  const portal = process.env.PORTAL_URL
    ? '<p style="margin:18px 0 0"><a href="' + esc(process.env.PORTAL_URL) + '">Open the student portal</a></p>' : '';

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#222">' +
    '<h2 style="margin:0 0 12px">Welcome to ' + esc(SCHOOL) + '</h2>' +
    '<p>The application for <b>' + esc(studentName) + '</b> has been approved' +
    (className ? ' for <b>' + esc(className) + '</b>' : '') + '. Here are the student\'s login details:</p>' +
    '<table style="border-collapse:collapse;margin:14px 0">' +
    '<tr><td style="padding:6px 14px 6px 0;color:#666">Reg number</td><td><b>' + esc(regNumber) + '</b></td></tr>' +
    '<tr><td style="padding:6px 14px 6px 0;color:#666">Password</td><td><b>' + esc(password) + '</b></td></tr></table>' +
    '<p>Please keep these details safe.</p>' + portal +
    '<p style="color:#888;font-size:12px;margin-top:24px">' + esc(SCHOOL) + '</p></div>';

  try {
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    await t.sendMail({
      from: '"' + SCHOOL.replace(/"/g, '') + '" <' + user + '>',
      to: toEmail,
      subject: 'Admission approved: login details for ' + studentName,
      html,
      text: 'Welcome to ' + SCHOOL + '. Student: ' + studentName + '. Reg number: ' + regNumber + '. Password: ' + password
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send failed:', e && e.message);
    return res.status(502).json({ ok: false, message: 'Email provider rejected the send' });
  }
};
