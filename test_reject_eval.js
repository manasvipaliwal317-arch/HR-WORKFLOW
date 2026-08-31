const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";

const sampleRejectionResume = `
Candidate Name: Bob Smith
Email: bob.smith@example.com
Phone: +1-555-9988
Role Applied For: Senior Machine Learning Architect

Summary:
Recent high school graduate with a passion for gaming and beginner HTML/CSS knowledge. Looking for a high-paying AI/ML leadership role.

Experience:
- Cashier at Local Store (2025 - Present)
  Handled register and customer service.

Skills:
HTML, Typing, Customer Service, Microsoft Word
`;

const systemInstruction = `
You are an expert Senior Technical Recruiter & HR Hiring AI.
Analyze the candidate's resume and email body thoroughly against industry standards for the role applied.
If candidate does not meet the minimum requirements, mark decision as REJECTED and matchScore < 60.

Return a strictly valid JSON object matching this schema:
{
  "candidateName": "Extracted Full Name",
  "candidateEmail": "Extracted or provided email",
  "candidatePhone": "Extracted phone or N/A",
  "appliedRole": "Senior Machine Learning Architect",
  "decision": "SELECTED" or "REJECTED",
  "matchScore": number (0 to 100),
  "yearsOfExperience": number or string,
  "topSkills": ["skill1", "skill2"],
  "education": "Degree or school",
  "strengths": ["strength1"],
  "areasForImprovement": ["area1", "area2"],
  "evaluationSummary": "Recruiter evaluation summary",
  "rejectionReason": "Specific constructive reason for rejection",
  "interviewQuestions": [],
  "proposedInterviewDate": null,
  "emailSubject": "Personalized email subject for the candidate",
  "emailBody": "Constructive, polite, encouraging rejection email"
}
`;

const payload = JSON.stringify({
  contents: [
    {
      parts: [
        { text: systemInstruction },
        { text: `EVALUATE THIS APPLICATION:\nEmail Body: Hey, check my resume for the Senior ML Architect role.\nResume Text:\n${sampleRejectionResume}` }
      ]
    }
  ],
  generationConfig: { responseMimeType: "application/json" }
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path: `/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const respObj = JSON.parse(data);
      const outputText = respObj.candidates[0].content.parts[0].text;
      console.log("Rejection Evaluation Result:", JSON.stringify(JSON.parse(outputText), null, 2));
    } catch(e) { console.log(data); }
  });
});
req.write(payload);
req.end();
