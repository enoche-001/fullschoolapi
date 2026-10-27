// POST /api/paystack-webhook
// Paystack calls this from its own servers whenever a payment succeeds, even if the
// student's phone lost network or closed the page. We confirm the payment with Paystack,
// then email a branded receipt to the payer.
//
// Paystack dashboard: Settings > API Keys & Webhooks > set the webhook URL (Test and Live are separate):
//   https://fullschoolapi.vercel.app/api/paystack-webhook
//
// Vercel environment variables used: PAYSTACK_SECRET_KEY, GMAIL_USER, GMAIL_APP_PASSWORD
// Optional: SCHOOL_NAME, RECEIPT_BCC (a school address that also gets a copy of every receipt)

const crypto = require('crypto');
const { buildReceipt } = require('../lib/receipt.js');

const SCHOOL = process.env.SCHOOL_NAME || 'Newtown Academy';
const FAKE_DOMAIN = '@newtownacademy.edu.ng'; // placeholder addresses the portal invents when a parent email is missing

function readRaw(req) {
  return new Promise(function (resolve, reject) {
    if (typeof req.body === 'string') return resolve({ raw: req.body, parsed: true });
    if (Buffer.isBuffer(req.body)) return resolve({ raw: req.body.toString('utf8'), parsed: true });
    if (req.body && typeof req.body === 'object') return resolve({ raw: JSON.stringify(req.body), parsed: true, obj: req.body });
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve({ raw: Buffer.concat(chunks).toString('utf8'), parsed: false }); });
    req.on('error', reject);
  });
}

const naira = function (kobo) {
  return '₦' + (Number(kobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const when = function (iso) {
  try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'long', timeStyle: 'short' }); }
  catch (e) { return String(iso || ''); }
};
const cap = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'paystack-webhook', secretKeySet: !!process.env.PAYSTACK_SECRET_KEY, gmailSet: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ ok: false, message: 'Server not configured' });

  let body;
  try { body = await readRaw(req); } catch (e) { return res.status(400).json({ ok: false }); }

  // 1) Signature: only checkable when we received the exact raw bytes Paystack sent.
  if (!body.parsed) {
    const expected = crypto.createHmac('sha512', secret).update(body.raw).digest('hex');
    const got = String(req.headers['x-paystack-signature'] || '');
    const a = Buffer.from(expected), b = Buffer.from(got);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ ok: false, message: 'Bad signature' });
  }

  let evt;
  try { evt = body.obj || JSON.parse(body.raw); } catch (e) { return res.status(400).json({ ok: false }); }
  if (!evt || evt.event !== 'charge.success' || !evt.data || !evt.data.reference) {
    return res.status(200).json({ ok: true, ignored: true }); // not a payment we care about
  }

  // 2) Never trust the webhook body alone: ask Paystack for the real transaction.
  let tx;
  try {
    const r = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(evt.data.reference), {
      headers: { Authorization: 'Bearer ' + secret }
    });
    const j = await r.json();
    if (!r.ok || !j.status || !j.data || j.data.status !== 'success') return res.status(200).json({ ok: true, ignored: 'not successful' });
    tx = j.data;
  } catch (e) {
    return res.status(502).json({ ok: false, message: 'Could not confirm with Paystack' }); // Paystack will retry
  }

  const to = String((tx.customer && tx.customer.email) || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.toLowerCase().endsWith(FAKE_DOMAIN)) {
    return res.status(200).json({ ok: true, skipped: 'no real email on this payment' });
  }

  // 3) Work out what the payment was for.
  const md = (tx.metadata && typeof tx.metadata === 'object') ? tx.metadata : {};
  const isFees = md.purpose === 'school_fees' || (!md.purpose && md.regNumber && md.term);
  const isReg = md.purpose === 'registration' || (!md.purpose && md.applicantName);
  const title = isFees ? 'School Fees' : isReg ? 'Registration Fee' : 'Payment';
  const auth = tx.authorization || {};
  const method = auth.last4 ? cap(auth.card_type || tx.channel || 'Card').trim() + ' •••• ' + auth.last4 : cap(tx.channel);

  const rows = [['Receipt number', tx.reference], ['Date', when(tx.paid_at || tx.paidAt)], ['Paid for', title]];
  if (isFees) {
    rows.push(['Student', md.studentName], ['Reg number', md.regNumber], ['Class', md.className],
      ['Term', md.term], ['Session', md.session]);
  } else if (isReg) {
    rows.push(['Applicant', md.applicantName], ['Class applied for', md.classApplied]);
  }
  rows.push(['Payment method', method], ['Status', 'Paid']);

  const amountText = naira(tx.amount);
  const rc = buildReceipt({ school: SCHOOL, title: title, amountText: amountText, rows: rows });

  // 4) Send.
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (e) { return res.status(500).json({ ok: false, message: 'nodemailer missing' }); }
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return res.status(500).json({ ok: false, message: 'Email not configured' });

  try {
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: user, pass: pass } });
    await t.sendMail({
      from: '"' + SCHOOL.replace(/"/g, '') + '" <' + user + '>',
      to: to,
      bcc: (process.env.RECEIPT_BCC || '').trim() || undefined,
      replyTo: user,
      subject: 'Payment receipt: ' + title + ' (' + tx.reference + ')',
      html: rc.html,
      text: rc.text,
      attachments: [{ filename: 'logo.jpg', content: require('../lib/logo.js'), cid: 'schoollogo', contentDisposition: 'inline' }]
    });
    return res.status(200).json({ ok: true, emailed: true });
  } catch (e) {
    console.error('receipt email failed:', e && e.code, e && e.message);
    return res.status(502).json({ ok: false, message: 'Receipt email failed' }); // Paystack retries (live mode)
  }
};

// Ask Vercel not to parse the body, so the signature can be checked against the exact bytes.
module.exports.config = { api: { bodyParser: false } };
