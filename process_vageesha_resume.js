const fs = require('fs');
const path = require('path');
const https = require('https');
const nodemailer = require('nodemailer');
const { PDFParse } = require('pdf-parse');

const CONFIG = {
  hrEmail: 'manasvipaliwal317@gmail.com',
  appPassword: 'kstnydybbuqmpbyr',
  geminiApiKey: 'YOUR_GEMINI_API_KEY',
  models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash'],
  companyName: 'Tech Innovations Inc.',
  threshold: 70
};

async function callGemini(resumeText, fileName, senderEmail, senderName) {
  const systemInstruction = `
You are an expert Senior Technical Recruiter & Hiring Director for ${CONFIG.companyName}.
Carefully analyze the resume content below:
1. Determine the candidate's exact target role based on their resume title, education, and summary (e.g. 'Business Analyst', 'Economics & Market Research Analyst', 'Operations Specialist', 'Digital Marketing Specialist').
2. Extract their actual name, email, phone from the resume text.
3. Evaluate objectively against industry standards:
   - Mark decision as 'SELECTED' if matchScore >= ${CONFIG.threshold}.
   - Mark decision as 'REJECTED' if matchScore < ${CONFIG.threshold}.
4. For SELECTED: generate 4-5 tailored technical/domain interview questions based on their projects and a warm interview invitation email.
5. For REJECTED: identify specific constructive feedback and generate a polite, encouraging rejection letter.

RETURN STRICT JSON ONLY:
{
  "candidateName": "Extracted Full Name",
  "candidateEmail": "Extracted Email or fallback",
  "candidatePhone": "Extracted Phone or N/A",
  "appliedRole": "Target Role Title",
  "decision": "SELECTED" or "REJECTED",
  "matchScore": number (0-100),
  "yearsOfExperience": "Years of experience",
  "topSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "education": "Degree & Institution",
  "strengths": ["Clear strength 1", "Clear strength 2", "Clear strength 3"],
  "areasForImprovement": ["Constructive point 1", "Constructive point 2"],
  "evaluationSummary": "Comprehensive 2-3 paragraphs recruiter assessment",
  "rejectionReason": "Specific constructive reason if REJECTED, otherwise null",
  "interviewQuestions": ["Question 1", "Question 2", "Question 3", "Question 4"],
  "proposedInterviewDate": "Suggested date (e.g. 'Next Wednesday at 2:00 PM EST')",
  "emailSubject": "Personalized subject line for candidate",
  "emailBody": "Personalized, warm and professional email message text (invitation if SELECTED, polite rejection if REJECTED)"
}
`;

  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          { text: systemInstruction },
          { text: `RESUME FILE: ${fileName}\nSENDER: ${senderName} (${senderEmail})\n\nFULL RESUME TEXT:\n${resumeText}` }
        ]
      }
    ],
    generationConfig: { responseMimeType: "application/json" }
  });

  for (const model of CONFIG.models) {
    try {
      console.log(`🤖 Attempting evaluation with ${model}...`);
      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${model}:generateContent?key=${CONFIG.geminiApiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 45000
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            try {
              const respObj = JSON.parse(d);
              if (respObj.error) return reject(new Error(`API ${respObj.error.code}: ${respObj.error.message}`));
              let raw = respObj.candidates[0].content.parts[0].text;
              raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
              resolve(JSON.parse(raw));
            } catch (err) {
              reject(new Error(`Parse error: ${err.message}`));
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timed out')); });
        req.write(payload);
        req.end();
      });

      console.log(`✅ Evaluation successful with ${model}!`);
      return result;
    } catch (e) {
      console.warn(`⚠️ [${model}] failed: ${e.message}. Trying next fallback...`);
    }
  }

  throw new Error("All models failed.");
}

async function sendAutoReply(toEmail, subject, bodyText) {
  console.log(`\n📧 Dispatching live email to "${toEmail}" via Gmail SMTP...`);
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: CONFIG.hrEmail, pass: CONFIG.appPassword }
  });

  const mailOptions = {
    from: `"${CONFIG.companyName} Recruitment Team" <${CONFIG.hrEmail}>`,
    to: toEmail,
    subject: subject,
    text: bodyText,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; line-height: 1.6; color: #333; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h3 style="color: #6366f1; margin-top: 0;">${CONFIG.companyName} — Application Update</h3>
        <p style="white-space: pre-line;">${bodyText}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b;">
          This email was processed and dispatched automatically by our HR Automation System.<br>
          Recruitment Mailbox: <strong>${CONFIG.hrEmail}</strong>
        </p>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`✅ Email Auto-Reply Dispatched! Message ID: ${info.messageId}`);
  return info;
}

async function run() {
  const filePath = path.join(__dirname, 'uploads', 'Vaggesha_Sharma_.pdf');
  console.log("Reading resume PDF from:", filePath);
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const parsed = await parser.getText();
  await parser.destroy();
  const resumeText = parsed.text || '';
  console.log(`Extracted ${resumeText.length} characters.`);
  console.log("Preview:\n", resumeText.slice(0, 300));

  const evaluation = await callGemini(resumeText, 'Vaggesha_Sharma_.pdf', 'sharmavageesha2000@gmail.com', 'Vageesha Sharma');
  console.log("\n================ EVALUATION ================");
  console.log("Candidate Name: ", evaluation.candidateName);
  console.log("Candidate Email:", evaluation.candidateEmail);
  console.log("Target Role:    ", evaluation.appliedRole);
  console.log("Decision:       ", evaluation.decision);
  console.log("Score:          ", evaluation.matchScore + "%");
  console.log("Top Skills:     ", (evaluation.topSkills || []).join(', '));
  console.log("============================================");

  const targetEmail = evaluation.candidateEmail || 'sharmavageesha2000@gmail.com';
  await sendAutoReply(targetEmail, evaluation.emailSubject, evaluation.emailBody);

  // Save to DB
  const dbPath = path.join(__dirname, 'candidates_db.json');
  let candidates = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  const now = new Date().toISOString();
  const candidateRecord = {
    id: 'cand_res_vageesha_' + Date.now().toString(36),
    name: evaluation.candidateName || 'Vaggesha Sharma',
    email: targetEmail,
    phone: evaluation.candidatePhone || '+91 7247647151',
    role: evaluation.appliedRole || 'Economics & Market Research Analyst',
    decision: evaluation.decision,
    matchScore: evaluation.matchScore,
    status: evaluation.decision === 'SELECTED' ? 'INTERVIEW_SCHEDULED' : 'REJECTED',
    yearsOfExperience: evaluation.yearsOfExperience || 'Postgraduate / Entry Level',
    topSkills: evaluation.topSkills || [],
    education: evaluation.education || 'Postgraduate in Economics',
    strengths: evaluation.strengths || [],
    areasForImprovement: evaluation.areasForImprovement || [],
    evaluationSummary: evaluation.evaluationSummary || '',
    rejectionReason: evaluation.rejectionReason,
    interviewQuestions: evaluation.interviewQuestions || [],
    proposedInterviewDate: evaluation.proposedInterviewDate || 'Next Week',
    interviewStatus: evaluation.decision === 'SELECTED' ? `Interview Invitation Sent to ${targetEmail}` : 'N/A',
    emailSubject: evaluation.emailSubject,
    emailBody: evaluation.emailBody,
    emailSentAt: now,
    createdAt: now,
    updatedAt: now,
    source: 'Gmail Attachment (Vaggesha_Sharma_.pdf)'
  };

  candidates = candidates.filter(c => !c.name.toLowerCase().includes('vageesha') && !c.name.toLowerCase().includes('vaggesha'));
  candidates.unshift(candidateRecord);
  fs.writeFileSync(dbPath, JSON.stringify(candidates, null, 2), 'utf8');
  console.log(`\n🎉 Saved ${evaluation.candidateName} to candidates_db.json! (Now Live on Dashboard)`);
}

run();
