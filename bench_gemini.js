const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";

function testWithNoTimeout() {
  const start = Date.now();
  console.log("Starting test call to gemini-3.5-flash...");
  
  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          { text: "You are a senior recruiter. Evaluate this candidate for AI Prompt Engineer: Kabir Singh, Fresher, knows NLP, LLM, Python, prompt chaining. Return a JSON with matchScore, decision (SELECTED/REJECTED), topSkills, evaluationSummary, emailSubject, emailBody." }
        ]
      }
    ],
    generationConfig: { responseMimeType: "application/json" }
  });

  const req = https.request({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`Finished in ${elapsed}s! Status: ${res.statusCode}`);
      console.log("Output snippet:\n", d.slice(0, 300));
    });
  });

  req.on('error', (err) => console.error("Req error:", err));
  req.write(payload);
  req.end();
}

testWithNoTimeout();
