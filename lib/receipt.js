// Builds the branded payment-receipt email (HTML + plain text). The logo is attached inline as cid:schoollogo.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAVY = '#0d1f3c', GOLD = '#b8902a';

function row(label, value) {
  if (!value) return '';
  return '<tr><td style="padding:9px 0;border-bottom:1px solid #eef1f7;color:#64748b;font-size:13px;width:40%;vertical-align:top">' + esc(label) +
    '</td><td style="padding:9px 0;border-bottom:1px solid #eef1f7;color:#0d1a2e;font-size:14px;font-weight:bold;text-align:right;vertical-align:top">' + esc(value) + '</td></tr>';
}

// d = { school, title, amountText, rows: [[label, value], ...], note }
function buildReceipt(d) {
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f5f7fc">' +
    '<table role="presentation" width="100%" style="background:#f5f7fc;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#0d1a2e;border:1px solid #e2e8f2">' +
    '<tr><td align="center" style="background:' + NAVY + ';padding:28px 20px 22px">' +
    '<img src="cid:schoollogo" width="72" height="72" alt="' + esc(d.school) + '" style="display:block;margin:0 auto 12px;border-radius:50%;border:3px solid ' + GOLD + ';background:#fff">' +
    '<div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:.3px">' + esc(d.school) + '</div>' +
    '<div style="color:#e9d28a;font-size:12px;letter-spacing:2px;margin-top:6px">PAYMENT RECEIPT</div></td></tr>' +
    '<tr><td style="height:4px;background:' + GOLD + ';font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 30px 8px">' +
    '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151">Thank you. We have received your payment for <b style="color:#0d1a2e">' + esc(d.title) + '</b>.</p>' +
    '<table role="presentation" width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:18px"><tr><td align="center" style="padding:16px">' +
    '<div style="font-size:12px;color:#166534;letter-spacing:1.5px">AMOUNT PAID</div>' +
    '<div style="font-size:28px;font-weight:bold;color:#14532d;margin-top:4px">' + esc(d.amountText) + '</div>' +
    '<div style="display:inline-block;margin-top:8px;background:#16a34a;color:#fff;font-size:11px;font-weight:bold;letter-spacing:1px;padding:4px 12px;border-radius:20px">PAID</div>' +
    '</td></tr></table>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse">' + d.rows.map(function (r) { return row(r[0], r[1]); }).join('') + '</table>' +
    '<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b">' + esc(d.note || 'This is an electronic receipt. Please keep it for your records and quote the receipt number if you contact the school office.') + '</p>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:22px 30px 26px;font-size:12px;color:#94a3b8">Thank you,<br><b style="color:#64748b">The Bursary, ' + esc(d.school) + '</b></td></tr>' +
    '</table></td></tr></table></body></html>';

  const text = d.school + ' - PAYMENT RECEIPT\n' + d.title + '\nAmount paid: ' + d.amountText + ' (PAID)\n' +
    d.rows.filter(function (r) { return r[1]; }).map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') +
    '\n\nThis is an electronic receipt. Please keep it for your records.';
  return { html: html, text: text };
}

module.exports = { buildReceipt };
