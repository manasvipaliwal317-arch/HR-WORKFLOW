const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const nodemailer = require('nodemailer');
const { PDFParse } = require('pdf-parse');

const CONFIG = {
  hrEmail: 'manasvipaliwal317@gmail.com',
  appPassword: 'kstnydybbuqmpbyr',
  geminiApiKey: 'YOUR_GEMINI_API_KEY',
  geminiModel: 'gemini-3.6-flash',
  companyName: 'Tech Innovations Inc.',
  threshold: 70
};

// 1. Setup IMAP
const imap = new Imap({
  user: CONFIG.hrEmail,
  password: CONFIG.appPassword,
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

async function callGeminiEvaluation({ candidateName, candidateEmail, appliedRole, resumeText, emailBody, fileName }) {
  console.log(`\n🤖 Calling Google Gemini 3.6 Flash for candidate "${candidateName}" (Role: ${appliedRole})...`);
  
  const systemInstruction = `
You are a Senior Technical Recruiter & HR Hiring Director for ${CONFIG.hrEmail} at ${CONFIG.companyName}.
Carefully analyze the candidate's actual resume content, skills, experience, and email cover letter against standard industry requirements for: '${appliedRole}'.

Evaluation Rules:
- If matchScore >= ${CONFIG.threshold}, set decision to 'SELECTED'.
- If matchScore < ${CONFIG.threshold}, set decision to 'REJECTED'.
- Assess technical/domain proficiency, relevant background, certifications, and educational pedigree.
- For SELECTED candidates: formulate 4-5 tailored domain/behavioral interview questions based on their resume and an upbeat, professional interview invitation email with proposed schedule slots.
- For REJECTED candidates: identify constructive feedback and draft a respectful rejection email with growth tips.

RETURN ONLY A VALID JSON OBJECT (No markdown wrapping, strict JSON):
{
  "candidateName": "${candidateName || 'Extracted Full Name'}",
  "candidateEmail": "${candidateEmail}",
  "candidatePhone": "Extracted phone or N/A",
  "appliedRole": "${appliedRole}",
  "decision": "SELECTED" or "REJECTED",
  "matchScore": number (0 to 100),
  "yearsOfExperience": "Years of experience (e.g., '2 years')",
  "topSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "education": "Extracted Degree and Institution",
  "strengths": ["Clear strength 1", "Clear strength 2", "Clear strength 3"],
  "areasForImprovement": ["Constructive point 1", "Constructive point 2"],
  "evaluationSummary": "2-3 paragraphs recruiter assessment evaluating their fit for ${appliedRole}",
  "rejectionReason": "Specific constructive reason if REJECTED, otherwise null",
  "interviewQuestions": ["Detailed question 1", "Detailed question 2", "Detailed question 3", "Detailed question 4"],
  "proposedInterviewDate": "Suggested date & time (e.g. 'Next Wednesday at 2:00 PM EST')",
  "emailSubject": "Personalized subject line for candidate",
  "emailBody": "Personalized, warm and professional email message text (invitation if SELECTED, polite rejection if REJECTED)"
}
`;

  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          { text: systemInstruction },
          {
            text: `LIVE CANDIDATE APPLICATION TO EVALUATE:\n- Sender Name: ${candidateName}\n- Sender Email: ${candidateEmail}\n- Applied Role: ${appliedRole}\n- Attachment Filename: ${fileName}\n\n- Candidate Email Body:\n${emailBody}\n\n- Full Extracted Resume Content:\n${resumeText}`
          }
        ]
      }
    ],
    generationConfig: { responseMimeType: "application/json" }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`,
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
          const rawText = respObj.candidates[0].content.parts[0].text;
          const evaluation = JSON.parse(rawText);
          resolve(evaluation);
        } catch (e) {
          reject(new Error(`Failed to parse Gemini output: ${e.message}\nRaw: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendCandidateAutoReply(toEmail, subject, bodyText) {
  console.log(`\n📧 Dispatching live auto-reply email to "${toEmail}" via Gmail SMTP...`);
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: CONFIG.hrEmail,
      pass: CONFIG.appPassword
    }
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
  console.log(`✅ Live Email Auto-Reply Dispatched! Message ID: ${info.messageId}`);
  return info;
}

// Main execution
imap.once('ready', () => {
  console.log('⚡ Connected to Gmail IMAP. Opening [Gmail]/All Mail...');
  imap.openBox('[Gmail]/All Mail', false, async (err, box) => {
    if (err) throw err;

    // Fetch the latest message
    const targetSeq = box.messages.total;
    console.log(`Fetching latest email (Seq #${targetSeq})...`);

    const f = imap.seq.fetch(`${targetSeq}:${targetSeq}`, {
      bodies: '',
      struct: true
    });

    let buffer = '';
    f.on('message', (msg) => {
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
      });
    });

    f.once('end', async () => {
      try {
        console.log('Parsing email content and attachments...');
        const parsed = await simpleParser(buffer);
        
        const candidateName = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].name || 'Manasvi Paliwal' : 'Manasvi Paliwal';
        const candidateEmail = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].address : 'manasvi60487.mbaib22@ipsacademy.org';
        const emailSubject = parsed.subject || 'Job application';
        const emailBody = parsed.text || '';

        console.log(`\n📬 Found Candidate Application:`);
        console.log(`   Candidate:   ${candidateName}`);
        console.log(`   Email:       ${candidateEmail}`);
        console.log(`   Subject:     ${emailSubject}`);
        console.log(`   Date:        ${parsed.date}`);
        console.log(`   Attachments: ${parsed.attachments ? parsed.attachments.length : 0}`);

        let resumeText = '';
        let fileName = 'No Attachment';

        if (parsed.attachments && parsed.attachments.length > 0) {
          const att = parsed.attachments[0];
          fileName = att.filename || 'resume.pdf';
          console.log(`\n📄 Downloading & extracting attachment "${fileName}" (${att.size} bytes)...`);

          // Save attachment to uploads folder
          const uploadPath = path.join(__dirname, 'uploads', fileName);
          fs.writeFileSync(uploadPath, att.content);
          console.log(`Saved attachment to ${uploadPath}`);

          // Parse PDF content
          try {
            const parser = new PDFParse({ data: att.content });
            const parsedPdf = await parser.getText();
            await parser.destroy();
            resumeText = parsedPdf.text || '';
            console.log(`Extracted ${resumeText.length} characters from resume PDF!`);
          } catch (pdfErr) {
            console.error('PDF parsing error:', pdfErr.message);
            resumeText = emailBody;
          }
        } else {
          resumeText = emailBody;
        }

        console.log(`\n--- RESUME PREVIEW ---`);
        console.log(resumeText.slice(0, 400));
        console.log(`----------------------`);

        // Detect Role (e.g. Digital Marketing from subject/body)
        let appliedRole = 'Digital Marketing Specialist';
        if (emailBody.toLowerCase().includes('digital marketing') || resumeText.toLowerCase().includes('digital marketing')) {
          appliedRole = 'Digital Marketing Specialist';
        } else if (emailBody.toLowerCase().includes('full stack') || resumeText.toLowerCase().includes('full stack')) {
          appliedRole = 'Senior Full Stack Engineer';
        }

        // Run Gemini 3.6 Flash Evaluation
        const evaluation = await callGeminiEvaluation({
          candidateName,
          candidateEmail,
          appliedRole,
          resumeText,
          emailBody,
          fileName
        });

        console.log(`\n================ EVALUATION RESULT ================`);
        console.log(`Candidate:    ${evaluation.candidateName}`);
        console.log(`Decision:     ${evaluation.decision} (Match Score: ${evaluation.matchScore}%)`);
        console.log(`Top Skills:   ${(evaluation.topSkills || []).join(', ')}`);
        console.log(`Strengths:    ${(evaluation.strengths || []).join(' | ')}`);
        console.log(`Interview Qs: ${(evaluation.interviewQuestions || []).length} questions generated`);
        console.log(`Email Subject:${evaluation.emailSubject}`);
        console.log(`===================================================`);

        // Send Live Auto-Reply to candidate
        const emailSendResult = await sendCandidateAutoReply(candidateEmail, evaluation.emailSubject, evaluation.emailBody);

        // Record Candidate in candidates_db.json
        const dbPath = path.join(__dirname, 'candidates_db.json');
        let candidates = [];
        if (fs.existsSync(dbPath)) {
          candidates = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        }

        const now = new Date().toISOString();
        const candidateRecord = {
          id: 'cand_live_' + Date.now().toString(36),
          name: evaluation.candidateName || candidateName,
          email: candidateEmail,
          phone: evaluation.candidatePhone || 'N/A',
          role: appliedRole,
          decision: evaluation.decision,
          matchScore: evaluation.matchScore,
          status: evaluation.decision === 'SELECTED' ? 'INTERVIEW_SCHEDULED' : 'REJECTED',
          yearsOfExperience: evaluation.yearsOfExperience || '2+',
          topSkills: evaluation.topSkills || [],
          education: evaluation.education || 'MBA / Graduate',
          strengths: evaluation.strengths || [],
          areasForImprovement: evaluation.areasForImprovement || [],
          evaluationSummary: evaluation.evaluationSummary || '',
          rejectionReason: evaluation.rejectionReason,
          interviewQuestions: evaluation.interviewQuestions || [],
          proposedInterviewDate: evaluation.proposedInterviewDate || 'Next Week',
          interviewStatus: evaluation.decision === 'SELECTED' ? `Invitation Dispatched to ${candidateEmail}` : 'N/A',
          emailSubject: evaluation.emailSubject,
          emailBody: evaluation.emailBody,
          emailSentAt: now,
          createdAt: now,
          updatedAt: now,
          source: `Gmail Attachment (${fileName})`
        };

        candidates.unshift(candidateRecord);
        fs.writeFileSync(dbPath, JSON.stringify(candidates, null, 2), 'utf8');
        console.log(`\n🎉 Candidate record successfully saved to HR Database (candidates_db.json)!`);
        console.log(`✨ Candidate is now live on Dashboard: http://localhost:3000`);

        imap.end();
      } catch (err) {
        console.error('Processing error:', err);
        imap.end();
      }
    });
  });
});

imap.connect();
