const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";

async function testModel(modelName) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: "Evaluate candidate: Name: Alice, Skills: React, Node.js. Reply JSON: {\"decision\": \"SELECTED\", \"score\": 95}" }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ model: modelName, status: res.statusCode, data }));
    });

    req.on('error', (e) => resolve({ model: modelName, error: e.message }));
    req.write(payload);
    req.end();
  });
}

async function run() {
  const models = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'];
  for (const m of models) {
    const res = await testModel(m);
    console.log(`Model: ${m} -> Status: ${res.status}`);
    if (res.status === 200) {
      console.log(`Success Output (${m}):`, res.data.slice(0, 300));
      break;
    }
  }
}

run();
