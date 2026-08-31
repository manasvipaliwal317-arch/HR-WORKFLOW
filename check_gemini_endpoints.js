const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";
const models = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-flash-latest',
  'gemini-pro-latest'
];

async function checkModel(m) {
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: "Evaluate test candidate in 1 short sentence." }] }]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${m}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ model: m, status: res.statusCode, body: d.slice(0, 150) }));
    });
    req.on('error', (e) => resolve({ model: m, error: e.message }));
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("Checking Gemini models status...");
  for (const m of models) {
    const res = await checkModel(m);
    console.log(`[${res.status}] ${m} -> ${res.body.replace(/\s+/g, ' ')}`);
  }
}

run();
