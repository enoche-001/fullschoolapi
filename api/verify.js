// POST /api/verify  { reference }  ->  { status: true, data: { amount, reference, currency } }
// Same response shape the portal already expects (register.html + student.html).
// Needs one environment variable on Vercel: PAYSTACK_SECRET_KEY
// Optional: ALLOWED_ORIGIN (e.g. https://yourname.github.io) to lock CORS down.

module.exports = async (req, res) => {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
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
