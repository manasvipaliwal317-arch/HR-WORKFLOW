const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";
const models = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash'
];

async function check(m) {
  const payload = JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${m}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ model: m, status: res.statusCode }));
    });
    req.on('error', (e) => resolve({ model: m, error: e.message }));
    req.write(payload);
    req.end();
  });
}

async function run() {
  for (const m of models) {
    const r = await check(m);
    console.log(`[Status ${r.status}] ${m}`);
  }
}

run();
