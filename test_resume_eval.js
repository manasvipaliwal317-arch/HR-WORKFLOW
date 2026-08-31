const https = require('https');

const apiKey = "YOUR_GEMINI_API_KEY";

const sampleResumeText = `
Candidate Name: Alex Morgan
Email: alex.morgan@example.com
Phone: +1-555-0199
Role Applied For: Full Stack Developer / Software Engineer

Summary:
Experienced Software Engineer with 4+ years of building web applications using React, Node.js, TypeScript, and PostgreSQL. Familiar with Docker, AWS, CI/CD pipelines, and REST APIs.

Experience:
- Senior Frontend Developer at TechCorp (2024 - Present):
  Led team of 4 engineers building customer dashboards in React and Tailwind.
- Software Engineer at DataSys (2022 - 2024):
  Built backend microservices in Node.js, Express, and PostgreSQL. Reduced latency by 35%.

Education:
B.S. in Computer Science, State University (2018 - 2022)

Skills:
JavaScript, TypeScript, React, Node.js, Express, PostgreSQL, Docker, Git, REST APIs
`;

const systemInstruction = `
You are an expert Senior Technical Recruiter & HR Hiring AI.
Analyze the candidate's resume and email body thoroughly against industry standards for the role.
Evaluate experience, technical skills, project relevance, and education.

Return a strictly valid JSON object matching this schema:
{
  "candidateName": "Extracted Full Name",
  "candidateEmail": "Extracted or provided email",
  "candidatePhone": "Extracted phone or N/A",
  "appliedRole": "Role name or Inferred Role",
  "decision": "SELECTED" or "REJECTED",
  "matchScore": number (0 to 100),
  "yearsOfExperience": number or string,
  "topSkills": ["skill1", "skill2", "skill3"],
  "education": "Degree and University",
  "strengths": ["strength1", "strength2"],
  "areasForImprovement": ["area1", "area2"],
  "evaluationSummary": "Comprehensive 2-3 paragraph professional recruiter evaluation",
  "rejectionReason": "Specific constructive reason if REJECTED, otherwise null",
  "interviewQuestions": ["3-5 customized technical & behavioral interview questions based on their resume"],
  "proposedInterviewDate": "Suggested date (e.g., within 3-5 business days)",
  "emailSubject": "Personalized email subject for the candidate",
  "emailBody": "Personalized, warm, highly professional HTML or text email to the candidate (either congratulations with interview invitation or polite constructive rejection)"
}
`;

const payload = JSON.stringify({
  contents: [
    {
      parts: [
        { text: systemInstruction },
        { text: `EVALUATE THIS APPLICATION:\nEmail Body: Hi HR, please find attached my resume for the developer opening.\nResume Text:\n${sampleResumeText}` }
      ]
    }
  ],
  generationConfig: {
    responseMimeType: "application/json"
  }
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
    console.log(`Status Code: ${res.statusCode}`);
    try {
      const respObj = JSON.parse(data);
      const outputText = respObj.candidates[0].content.parts[0].text;
      console.log("Evaluation Result:", JSON.stringify(JSON.parse(outputText), null, 2));
    } catch(e) {
      console.log("Raw Response:", data);
    }
  });
});

req.on('error', (e) => console.error(e));
req.write(payload);
req.end();
