// POST /api/send-credentials
// Headers: Authorization: Bearer <Firebase ID token of a signed-in ADMIN>
// Body:    { toEmail, studentName, regNumber, password, className }
// Sends the login details to the parent by Gmail (nodemailer).
//
// Vercel environment variables:
//   GMAIL_USER          the Gmail address that sends the mail
//   GMAIL_APP_PASSWORD  a 16-character Google "App password" (NOT your normal password)
//   ALLOWED_ORIGIN      e.g. https://yourname.github.io
// Optional: SCHOOL_NAME, PORTAL_URL (site base address), LOGO_URL, FIREBASE_API_KEY, FIREBASE_PROJECT_ID

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
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://enoche-001.github.io');
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

  // PORTAL_URL = the website's base address, e.g. https://yourname.github.io/yourrepo (no trailing slash).
  // It gives the email a login button and the school logo (taken from /assets/newtown-academy-logo.jpg).
  const base = (process.env.PORTAL_URL || 'https://enoche-001.github.io/fullschool').trim().replace(/\/+$/, '');
  const loginUrl = base ? base + '/student.html' : '';
  const logoUrl = (process.env.LOGO_URL || '').trim() || (base ? base + '/assets/newtown-academy-logo.jpg' : '');
  const NAVY = '#0d1f3c', GOLD = '#b8902a';

  const logo = logoUrl
    ? '<img src="' + esc(logoUrl) + '" width="72" height="72" alt="' + esc(SCHOOL) + '" style="display:block;margin:0 auto 12px;border-radius:50%;border:3px solid ' + GOLD + ';background:#fff">'
    : '';
  const button = loginUrl
    ? '<table role="presentation" align="center" style="margin:26px auto 4px"><tr><td style="background:' + NAVY + ';border-radius:8px">' +
      '<a href="' + esc(loginUrl) + '" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px">Log in to the Student Portal</a>' +
      '</td></tr></table>'
    : '';

  const html =
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fc">' +
    '<table role="presentation" width="100%" style="background:#f5f7fc;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#0d1a2e;border:1px solid #e2e8f2">' +
    // header
    '<tr><td align="center" style="background:' + NAVY + ';padding:28px 20px 22px">' + logo +
    '<div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:.3px">' + esc(SCHOOL) + '</div>' +
    '<div style="color:#e9d28a;font-size:12px;letter-spacing:2px;margin-top:6px">ADMISSION APPROVED</div></td></tr>' +
    '<tr><td style="height:4px;background:' + GOLD + ';font-size:0;line-height:0">&nbsp;</td></tr>' +
    // body
    '<tr><td style="padding:30px 30px 8px">' +
    '<p style="margin:0 0 14px;font-size:16px">Dear Parent/Guardian,</p>' +
    '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151">We are pleased to inform you that the admission application for <b style="color:#0d1a2e">' + esc(studentName) + '</b> has been approved' +
    (className ? ', and the student has been placed in <b style="color:#0d1a2e">' + esc(className) + '</b>' : '') + '.</p>' +
    '<p style="margin:0 0 10px;font-size:14px;color:#64748b">Student login details</p>' +
    '<table role="presentation" width="100%" style="background:#fdf8ec;border:1px solid #f0d98a;border-radius:10px"><tr><td style="padding:18px 20px">' +
    '<div style="font-size:12px;color:#64748b;letter-spacing:1px">REGISTRATION NUMBER</div>' +
    '<div style="font-size:20px;font-weight:bold;color:' + NAVY + ';margin:4px 0 16px">' + esc(regNumber) + '</div>' +
    '<div style="font-size:12px;color:#64748b;letter-spacing:1px">PASSWORD</div>' +
    '<div style="font-size:20px;font-weight:bold;color:' + NAVY + ';margin-top:4px;font-family:Courier New,monospace">' + esc(password) + '</div>' +
    '</td></tr></table>' + button +
    '<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b">Please keep these details private and do not share them with anyone outside your family. If you did not expect this email, you can ignore it.</p>' +
    '</td></tr>' +
    // footer
    '<tr><td align="center" style="padding:22px 30px 26px;font-size:12px;color:#94a3b8">' +
    'Warm regards,<br><b style="color:#64748b">The Administration, ' + esc(SCHOOL) + '</b></td></tr>' +
    '</table></td></tr></table></body></html>';

  try {
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    await t.sendMail({
      from: '"' + SCHOOL.replace(/"/g, '') + '" <' + user + '>',
      to: toEmail,
      subject: 'Admission approved: login details for ' + studentName,
      html,
      text: 'Dear Parent/Guardian, the admission for ' + studentName + ' at ' + SCHOOL + ' has been approved. Registration number: ' + regNumber + ' | Password: ' + password + (loginUrl ? ' | Login: ' + loginUrl : '') + '. Please keep these details private.'
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send failed:', e && e.code, e && e.message);
    let msg = 'Email provider rejected the send';
    if (e && e.code === 'EAUTH') {
      msg = 'Gmail rejected the login. The App Password is wrong, was deleted, or 2-Step Verification is off. Create a new App Password and update GMAIL_APP_PASSWORD in Vercel, then redeploy.';
    } else if (e && (e.code === 'ESOCKET' || e.code === 'ETIMEDOUT' || e.code === 'ECONNECTION')) {
      msg = 'Could not reach Gmail. Try again in a moment.';
    } else if (e && e.responseCode === 550) {
      msg = 'Gmail refused to send to that address. Check the parent email.';
    }
    return res.status(502).json({ ok: false, message: msg });
  }
};
