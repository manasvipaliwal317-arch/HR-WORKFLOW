const https = require('https');
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const apiKey = "YOUR_GEMINI_API_KEY";

async function run() {
  const filePath = path.join(__dirname, 'uploads', 'Frontend_Developer_1_3_Years_Resume.pdf');
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const p = await parser.getText();
  await parser.destroy();
  const resumeText = p.text;
  console.log('Resume text length:', resumeText.length);

  const systemInstruction = `You are a Senior Technical Recruiter.
Evaluate the candidate application against active opening: "Full Stack Developer" or "Digital Marketing Specialist".
Score >= 70 is SELECTED, otherwise REJECTED.
Return strictly JSON matching:
{
  "candidateName": "Full Name",
  "candidateEmail": "email",
  "candidatePhone": "phone",
  "appliedRole": "Full Stack Developer",
  "decision": "SELECTED" or "REJECTED",
  "matchScore": 75,
  "yearsOfExperience": "2 years",
  "topSkills": ["React", "Node.js"],
  "education": "Degree",
  "strengths": ["strength1"],
  "areasForImprovement": ["improvement1"],
  "evaluationSummary": "Recruiter summary",
  "rejectionReason": null,
  "interviewQuestions": ["Q1", "Q2"],
  "proposedInterviewDate": "Friday, September 4, 2026",
  "emailSubject": "Subject line",
  "emailBody": "Email body text"
}`;

  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          { text: systemInstruction },
          { text: `ATTACHMENT: Frontend_Developer_1_3_Years_Resume.pdf\nSENDER: Rishu (paliwalrishu2000@gmail.com)\n\nRESUME CONTENT:\n${resumeText}` }
        ]
      }
    ],
    generationConfig: { responseMimeType: "application/json" }
  });

  const models = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];
  for (const m of models) {
    console.log(`Testing model: ${m}...`);
    const start = Date.now();
    try {
      const res = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${m}:generateContent?key=${apiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 25000
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve({ status: res.statusCode, data: d }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(payload);
        req.end();
      });
      console.log(`Model ${m} finished in ${Date.now() - start}ms, status: ${res.status}`);
      if (res.status === 200) {
        console.log('Sample response:', res.data.slice(0, 300));
        break;
      } else {
        console.log('Error response:', res.data);
      }
    } catch (e) {
      console.log(`Model ${m} failed in ${Date.now() - start}ms:`, e.message);
    }
  }
}

run();
