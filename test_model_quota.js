const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";
const models = ['gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

async function testModel(m) {
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: "Hello, reply in 3 words." }] }]
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
  for (const m of models) {
    const res = await testModel(m);
    console.log(`Model: ${m} -> Status ${res.status} | Body: ${res.body}`);
  }
}

run();
