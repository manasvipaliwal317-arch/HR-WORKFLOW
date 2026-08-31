const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const obj = JSON.parse(d);
      console.log("All available models for this key:");
      obj.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
        .forEach(m => console.log(`- ${m.name.replace('models/', '')} (${m.displayName})`));
    } catch(e) {
      console.error(e, d);
    }
  });
});
