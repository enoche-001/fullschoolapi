// POST /api/ai-generate
// Headers: Authorization: Bearer <Firebase ID token of a signed-in ADMIN or TEACHER>
// Body: { subject, topic, className, count (1-12), difficulty, style, material (text, max ~24000 chars),
//         diagrams (bool), avoid: [first words of questions already made] }
// Returns: { ok:true, questions:[{questionText, options:{a,b,c,d}, correctAnswer, explanation, diagramSvg?}] }
// GET shows whether the server is set up (no secrets shown).
//
// Vercel environment variables:
//   GEMINI_API_KEY   your key from https://aistudio.google.com/apikey   (REQUIRED)
//   GEMINI_MODEL     optional, default "gemini-3.8-flash". Any Gemini model name from AI Studio works.
//                    You can list several, comma separated: they are tried in order if one is busy/unavailable.
// Optional: ALLOWED_ORIGIN, FIREBASE_PROJECT_ID

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'veil-1-bd7b5';
const SITE = 'https://enoche-001.github.io';
// GEMINI_MODEL may hold several names separated by commas. They are tried in order when one is busy or unavailable.
const MODELS = String(process.env.GEMINI_MODEL || 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite').split(',').map(x => x.trim().replace(/^models\//, '')).filter(Boolean);
const MODEL = MODELS[0];

function allowedOrigins() {
  const list = [SITE];
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

function uidFromToken(t) {
  try {
    const payload = JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload.user_id || payload.sub || '';
  } catch (e) { return ''; }
}
// Firestore itself rejects fake/expired tokens (401); the rules only let a user read their OWN
// admins/{uid} or teachers/{uid} doc, so a 200 proves a real signed-in admin or teacher.
async function role(idToken) {
  const uid = uidFromToken(idToken);
  if (!uid || !/^[A-Za-z0-9]{10,128}$/.test(uid)) return null;
  for (const col of ['admins', 'teachers']) {
    const r = await fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/' + col + '/' + encodeURIComponent(uid),
      { headers: { Authorization: 'Bearer ' + idToken } });
    if (r.status === 200) return { uid, role: col };
  }
  return null;
}

// Best-effort limiter (resets when the server instance recycles): 40 requests / hour / user.
const hits = new Map();
function limited(uid) {
  const now = Date.now(), arr = (hits.get(uid) || []).filter(t => now - t < 3600e3);
  arr.push(now); hits.set(uid, arr);
  return arr.length > 40;
}

// ---- SVG safety: keep only simple drawing tags/attributes ----
const TAGS = new Set(['svg','g','line','polyline','polygon','rect','circle','ellipse','path','text','tspan','defs','marker']);
function cleanSvg(s) {
  if (typeof s !== 'string') return '';
  s = s.trim();
  if (!/^<svg[\s>]/i.test(s) || s.length > 6000) return '';
  if (/<\s*(script|style|foreignObject|image|use|a|iframe|animate|set)\b/i.test(s)) return '';
  if (/\son\w+\s*=|javascript:|data:|href\s*=|xlink|<!|<\?/i.test(s)) return '';
  const tags = s.match(/<\/?\s*([a-zA-Z0-9]+)/g) || [];
  for (const t of tags) { if (!TAGS.has(t.replace(/[<\/\s]/g, '').toLowerCase())) return ''; }
  return s;
}

function parseJSON(text) {
  text = String(text || '').replace(/```json/gi, '').replace(/```/g, '');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no json');
  return JSON.parse(text.slice(a, b + 1));
}

function buildPrompt(b) {
  const math = /math|further|geometry|trigonometry|physics|technical drawing|basic science|chemistry|biology|geography/i.test(b.subject);
  const diagrams = b.diagrams === true;
  return [
    'You are an expert Nigerian secondary-school examination setter (WAEC / NECO / JAMB standard).',
    'Write exactly ' + b.count + ' multiple-choice questions for the subject "' + b.subject + '"' + (b.className ? ' for class "' + b.className + '"' : '') + '.',
    b.topic ? 'Focus area: ' + b.topic + '.' : '',
    'Difficulty: ' + b.difficulty + '. Style: ' + b.style + '.',
    b.material ? 'Base the questions ONLY on the teaching material between the markers below. Do not ask about things the material does not cover.\n<<<MATERIAL\n' + b.material + '\nMATERIAL>>>' : '',
    b.avoid && b.avoid.length ? 'Do NOT repeat or closely resemble these existing questions: ' + b.avoid.join(' | ') : '',
    '',
    'RULES',
    '- Every question has exactly 4 options (a, b, c, d) and exactly ONE correct option. Distractors must be plausible, not silly.',
    '- Numeric questions: solve every one step by step BEFORE writing the options, then re-check the arithmetic. The marked answer must be mathematically correct and appear among the options.',
    '- Write maths in plain Unicode only (x², x³, √, ½, ¾, π, °, ×, ÷, ≤, ≥, ≠, ∠, △, ⊥, ∥, θ). Never use LaTeX, $ signs or backslashes.',
    '- Keep the explanation to 1-2 short sentences (for numeric questions show the key working).',
    diagrams
      ? '- DIAGRAMS: Where a question is about a shape or figure (triangles, circles, rectangles, parallel lines, angles, polygons, bearings, graphs of lines, etc.) include a "diagramSvg" string with a clean, accurate SVG drawing. Other questions must omit diagramSvg. Every length, angle and label written in the question must match the drawing. SVG rules: one <svg viewBox="0 0 300 200"> element; use only line, polyline, polygon, rect, circle, ellipse, path, text, g; black strokes (stroke="#111" stroke-width="2"), fill="none" or a light fill like "#eef2ff"; labels with <text font-size="14" font-family="Arial"> placed next to the vertices/sides; mark right angles with a small square; no scripts, no images, no CSS, no external references; under 2500 characters. Draw to scale where possible.'
      : '- Do not include diagrams.',
    '',
    'Respond with ONLY valid JSON (no markdown, no commentary) in exactly this shape:',
    '{"questions":[{"questionText":"...","options":{"a":"...","b":"...","c":"...","d":"..."},"correctAnswer":"a","explanation":"..."' + (diagrams ? ',"diagramSvg":"<svg ...>...</svg>"' : '') + '}]}'
  ].filter(Boolean).join('\n');
}

module.exports = async (req, res) => {
  setCors(req, res, 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'ai-generate', geminiKeySet: !!process.env.GEMINI_API_KEY, models: MODELS });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ ok: false, message: 'AI is not set up on the server yet (GEMINI_API_KEY missing).' });

  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ ok: false, message: 'Please sign in again.' });
  let who;
  try { who = await role(m[1]); } catch (e) { return res.status(502).json({ ok: false, message: 'Could not verify your login. Try again.' }); }
  if (!who) return res.status(403).json({ ok: false, message: 'Only admins and teachers can use the AI generator.' });
  if (limited(who.uid)) return res.status(429).json({ ok: false, message: 'Too many AI requests this hour. Please wait a while.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const b = {
    subject: String(body.subject || '').slice(0, 80).trim(),
    topic: String(body.topic || '').slice(0, 200).trim(),
    className: String(body.className || '').slice(0, 40).trim(),
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(body.difficulty) ? body.difficulty : 'medium',
    style: String(body.style || 'WAEC/JAMB style').slice(0, 60),
    count: Math.max(1, Math.min(12, parseInt(body.count, 10) || 5)),
    material: String(body.material || '').slice(0, 24000).trim(),
    diagrams: body.diagrams === true,
    avoid: Array.isArray(body.avoid) ? body.avoid.slice(0, 40).map(x => String(x).slice(0, 70)) : []
  };
  if (!b.subject) return res.status(400).json({ ok: false, message: 'Subject is required.' });
  if (!b.topic && !b.material) return res.status(400).json({ ok: false, message: 'Give a topic or upload teaching material.' });

  let text = '', lastErr = null, usedModel = '';
  for (const model of MODELS) {
    let r, data = {};
    try {
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(b) }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: parseInt(process.env.GEMINI_MAX_TOKENS, 10) || 6000, responseMimeType: 'application/json' }
        })
      });
      try { data = await r.json(); } catch (e) {}
    } catch (e) { lastErr = { status: 0, message: 'Could not reach the AI service. Try again.' }; continue; }
    if (!r.ok) {
      const gm = (data && data.error && data.error.message) || ('AI service error ' + r.status);
      lastErr = { status: r.status, message: gm, model };
      // busy / overloaded / model gone: try the next model in the list
      if (r.status === 429 || r.status === 404 || r.status >= 500 || /no longer available|not found|overloaded|high demand/i.test(gm)) continue;
      break;
    }
    const cand = data.candidates && data.candidates[0];
    if (!cand || !cand.content || !cand.content.parts) {
      lastErr = { status: 200, message: 'The AI returned nothing usable (' + ((data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'empty answer') + '). Try different wording or fewer questions.', blocked: true };
      break;
    }
    text = cand.content.parts.map(p => p.text || '').join(''); usedModel = model; lastErr = null; break;
  }
  if (lastErr) {
    if (lastErr.blocked || lastErr.status === 0) return res.status(502).json({ ok: false, message: lastErr.message });
    if (lastErr.status === 429) return res.status(429).json({ ok: false, message: 'The AI is busy or the free daily limit is reached. Please try again later.' });
    if ([400, 401, 403, 404].includes(lastErr.status)) return res.status(502).json({ ok: false, message: 'Gemini rejected the request (check the API key and model name): ' + lastErr.message });
    return res.status(502).json({ ok: false, message: 'Gemini error: ' + lastErr.message });
  }

  let parsed;
  try { parsed = parseJSON(text); }
  catch (e) { return res.status(502).json({ ok: false, message: 'The AI gave an unreadable answer. Please try again.' }); }

  const out = [];
  (Array.isArray(parsed.questions) ? parsed.questions : []).forEach(q => {
    if (!q || typeof q.questionText !== 'string' || !q.options) return;
    const o = {}; for (const k of ['a', 'b', 'c', 'd']) { if (q.options[k] == null || String(q.options[k]).trim() === '') return; o[k] = String(q.options[k]).trim(); }
    const ca = String(q.correctAnswer || '').toLowerCase().trim();
    if (!['a', 'b', 'c', 'd'].includes(ca)) return;
    if (new Set(Object.values(o)).size < 4) return;                // duplicate options = broken question
    const item = { questionText: q.questionText.trim(), options: o, correctAnswer: ca, explanation: String(q.explanation || '').trim() };
    if (b.diagrams && q.diagramSvg) { const s = cleanSvg(q.diagramSvg); if (s) item.diagramSvg = s; }
    out.push(item);
  });
  if (!out.length) return res.status(502).json({ ok: false, message: 'No usable questions came back. Try again or change the topic.' });
  return res.status(200).json({ ok: true, questions: out, model: usedModel });
};
