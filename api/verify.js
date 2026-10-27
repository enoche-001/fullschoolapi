// POST /api/verify  { reference }  ->  { status: true, data: { amount, reference, currency } }
// Same response shape the portal already expects (register.html + student.html).
// Needs one environment variable on Vercel: PAYSTACK_SECRET_KEY
// Optional: ALLOWED_ORIGIN (e.g. https://yourname.github.io) to lock CORS down.


// Accepts the website's origin even if ALLOWED_ORIGIN in Vercel was typed with a path or trailing slash.
const SITE = 'https://enoche-001.github.io';
function allowedOrigins() {
  const list = [SITE];
  // ALLOWED_ORIGIN may hold several website addresses separated by commas or spaces.
  String(process.env.ALLOWED_ORIGIN || '').split(/[\s,]+/).forEach(function (x) {
    if (x && x !== '*') { try { var o = new URL(x).origin; if (list.indexOf(o) < 0) list.push(o); } catch (e) {} }
  });
  return list;
}
function setCors(req, res, headers) {
  const list = allowedOrigins();
  const o = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', o && list.includes(o) ? o : list[list.length - 1]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', headers);
  res.setHeader('Vary', 'Origin');
}

module.exports = async (req, res) => {
  setCors(req, res, 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'verify', paystackSecretKeySet: !!process.env.PAYSTACK_SECRET_KEY });
  }
  if (req.method !== 'POST') return res.status(405).json({ status: false, message: 'Method not allowed' });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ status: false, message: 'Server not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const reference = body && typeof body.reference === 'string' ? body.reference.trim() : '';
  if (!reference || !/^[A-Za-z0-9._=-]{3,100}$/.test(reference)) {
    return res.status(400).json({ status: false, message: 'Invalid reference' });
  }

  try {
    const r = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
      headers: { Authorization: 'Bearer ' + secret }
    });
    const j = await r.json();

    // Paystack returns status:true even for failed/abandoned payments,
    // so we must check the transaction's own status.
    if (!r.ok || !j.status || !j.data || j.data.status !== 'success') {
      return res.status(402).json({ status: false, message: (j && j.message) || 'Payment not successful' });
    }
    return res.status(200).json({
      status: true,
      data: { amount: j.data.amount, reference: j.data.reference, currency: j.data.currency }
    });
  } catch (e) {
    return res.status(502).json({ status: false, message: 'Could not reach Paystack' });
  }
};
