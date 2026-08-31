const https = require('https');
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const nodemailer = require('nodemailer');

const CONFIG = {
  hrEmail: 'manasvipaliwal317@gmail.com',
  appPassword: 'kstnydybbuqmpbyr',
  geminiApiKey: 'YOUR_GEMINI_API_KEY',
  models: ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.6-flash'],
  companyName: 'Tech Innovations Inc.',
  threshold: 70
};

// Robust Multi-Model Gemini caller
async function callGeminiEvaluation(resumeText, fileName, senderEmail, senderName) {
  const systemInstruction = `
You are an expert Senior Technical Recruiter & Hiring Director for ${CONFIG.companyName}.
Carefully analyze the resume content below. 
1. Determine the candidate's exact target role based on their resume title/summary (e.g. 'AI Prompt Engineer', 'Digital Marketing Manager', 'Software Engineer').
2. Extract their actual name, email, phone from the resume text (prefer extracted resume contact info over sender email).
3. Evaluate against industry standards for that specific role:
   - Mark decision as 'SELECTED' if matchScore >= ${CONFIG.threshold}.
   - Mark decision as 'REJECTED' if matchScore < ${CONFIG.threshold}.
4. For SELECTED: generate 4-5 tailored technical/domain interview questions based on their projects and a warm interview invitation email with proposed scheduling slots.
5. For REJECTED: identify specific constructive feedback and generate a polite, encouraging rejection letter.

RETURN STRICT JSON ONLY (no markdown formatting, no backticks, pure valid JSON):
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
          { text: `RESUME FILE: ${fileName}\nSENDER HINT: ${senderName} (${senderEmail})\n\nFULL RESUME TEXT:\n${resumeText}` }
        ]
      }
    ],
    generationConfig: { responseMimeType: "application/json" }
  });

  for (const model of CONFIG.models) {
    try {
      console.log(`🤖 Attempting evaluation with ${model}...`);
      const evaluation = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${model}:generateContent?key=${CONFIG.geminiApiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 60000
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            try {
              const respObj = JSON.parse(d);
              if (respObj.error) {
                return reject(new Error(`API Error ${respObj.error.code}: ${respObj.error.message}`));
              }
              if (!respObj.candidates || !respObj.candidates[0] || !respObj.candidates[0].content) {
                return reject(new Error(`Empty candidate output`));
              }
              let raw = respObj.candidates[0].content.parts[0].text;
              raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
              resolve(JSON.parse(raw));
            } catch (err) {
              reject(new Error(`Parse error: ${err.message}`));
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        req.write(payload);
        req.end();
      });

      console.log(`✅ Evaluation successful using ${model}!`);
      return evaluation;
    } catch (e) {
      console.warn(`⚠️ [${model}] failed: ${e.message}. Trying next fallback model...`);
    }
  }

  throw new Error("All Gemini models failed or hit quota limits.");
}

// Auto reply sender
async function sendAutoReply(toEmail, subject, bodyText) {
  console.log(`\n📧 Dispatching auto-reply email to "${toEmail}" via Gmail SMTP...`);
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

// Process single candidate
async function processCandidate(filePath, originalName, fallbackEmail) {
  console.log(`\n===============================================================`);
  console.log(`⚡ PROCESSING: ${originalName}`);
  
  let resumeText = '';
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf') {
    const buf = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buf });
    const res = await parser.getText();
    await parser.destroy();
    resumeText = res.text || '';
  } else if (ext === '.docx') {
    const resDoc = await mammoth.extractRawText({ path: filePath });
    resumeText = resDoc.value || '';
  }

  console.log(`Extracted ${resumeText.length} characters.`);
  
  const evalResult = await callGeminiEvaluation(resumeText, originalName, fallbackEmail, 'Candidate');
  
  console.log(`\n🎯 EVALUATION:`);
  console.log(`   Candidate:   ${evalResult.candidateName}`);
  console.log(`   Email:       ${evalResult.candidateEmail}`);
  console.log(`   Phone:       ${evalResult.candidatePhone}`);
  console.log(`   Role:        ${evalResult.appliedRole}`);
  console.log(`   Decision:    ${evalResult.decision} (Score: ${evalResult.matchScore}%)`);
  console.log(`   Top Skills:  ${(evalResult.topSkills || []).join(', ')}`);
  console.log(`   Strengths:   ${(evalResult.strengths || []).join(' | ')}`);
  console.log(`   Questions:   ${(evalResult.interviewQuestions || []).length} questions generated`);

  // Target candidate email (or fallback to user email for verification)
  const targetEmail = evalResult.candidateEmail || fallbackEmail;
  await sendAutoReply(targetEmail, evalResult.emailSubject, evalResult.emailBody);

  // Save to DB
  const dbPath = path.join(__dirname, 'candidates_db.json');
  let candidates = [];
  if (fs.existsSync(dbPath)) {
    candidates = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }

  const now = new Date().toISOString();
  const candidateRecord = {
    id: 'cand_res_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    name: evalResult.candidateName,
    email: targetEmail,
    phone: evalResult.candidatePhone || 'N/A',
    role: evalResult.appliedRole,
    decision: evalResult.decision,
    matchScore: evalResult.matchScore,
    status: evalResult.decision === 'SELECTED' ? 'INTERVIEW_SCHEDULED' : 'REJECTED',
    yearsOfExperience: evalResult.yearsOfExperience || 'Fresher',
    topSkills: evalResult.topSkills || [],
    education: evalResult.education || 'Graduate',
    strengths: evalResult.strengths || [],
    areasForImprovement: evalResult.areasForImprovement || [],
    evaluationSummary: evalResult.evaluationSummary || '',
    rejectionReason: evalResult.rejectionReason,
    interviewQuestions: evalResult.interviewQuestions || [],
    proposedInterviewDate: evalResult.proposedInterviewDate || 'Upcoming Week',
    interviewStatus: evalResult.decision === 'SELECTED' ? `Interview Invitation Sent to ${targetEmail}` : 'N/A',
    emailSubject: evalResult.emailSubject,
    emailBody: evalResult.emailBody,
    emailSentAt: now,
    createdAt: now,
    updatedAt: now,
    source: `Gmail Attachment (${originalName})`
  };

  // Avoid exact duplicates
  candidates = candidates.filter(c => c.name !== candidateRecord.name || c.role !== candidateRecord.role);
  candidates.unshift(candidateRecord);
  fs.writeFileSync(dbPath, JSON.stringify(candidates, null, 2), 'utf8');
  console.log(`✅ Saved "${evalResult.candidateName}" to candidates_db.json (Live in Dashboard)`);
  return candidateRecord;
}

async function run() {
  const p1 = path.join(__dirname, 'uploads', '4_Kabir_Singh_AI_Prompt_Engineer_Fresher (1).pdf');
  if (fs.existsSync(p1)) {
    await processCandidate(p1, '4_Kabir_Singh_AI_Prompt_Engineer_Fresher.pdf', 'manasvi60487.mbaib22@ipsacademy.org');
  }

  const p2 = path.join(__dirname, 'uploads', '5_Sneha_Verma_Digital_Marketing.docx');
  if (fs.existsSync(p2)) {
    await processCandidate(p2, '5_Sneha_Verma_Digital_Marketing.docx', 'manasvi60487.mbaib22@ipsacademy.org');
  }
}

run();
