const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";

const candidates = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest'
];

async function benchOne(model) {
  const start = Date.now();
  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          { text: "Evaluate candidate for Full Stack Developer: John Doe, 3 yrs React, Node. Return JSON with decision (SELECTED/REJECTED), matchScore (0-100), emailSubject, emailBody." }
        ]
      }
    ],
    generationConfig: { responseMimeType: "application/json" }
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        resolve({ model, status: res.statusCode, elapsed, body: d.slice(0, 150) });
      });
    });

    req.on('error', (e) => resolve({ model, status: 'ERROR', elapsed: ((Date.now() - start) / 1000).toFixed(2), error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ model, status: 'TIMEOUT', elapsed: '10.0' }); });
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("Benchmarking all candidate models with key...");
  for (const m of candidates) {
    const r = await benchOne(m);
    console.log(`[${r.model}] Status: ${r.status} (${r.elapsed}s) -> ${r.error || r.body}`);
  }
}

run();
