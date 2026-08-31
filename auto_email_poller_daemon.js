const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const nodemailer = require('nodemailer');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

// Protect daemon from crashing on any unhandled error
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Daemon Caught Exception]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Daemon Unhandled Rejection]:', reason);
});

const CONFIG = {
  hrEmail: 'manasvipaliwal317@gmail.com',
  appPassword: 'kstnydybbuqmpbyr',
  geminiApiKey: 'YOUR_GEMINI_API_KEY',
  models: ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.6-flash'],
  companyName: 'Tech Innovations Inc.',
  threshold: 70,
  pollIntervalMs: 10000 // Exact 10 seconds
};

const PROCESSED_FILE = path.join(__dirname, 'processed_email_uids.json');
const DB_FILE = path.join(__dirname, 'candidates_db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function getProcessedUIDs() {
  try {
    if (fs.existsSync(PROCESSED_FILE)) {
      return JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveProcessedUID(uid) {
  const list = getProcessedUIDs();
  const uidStr = uid.toString();
  if (!list.includes(uidStr)) {
    list.push(uidStr);
    // Keep max 500 records
    if (list.length > 500) list.shift();
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(list, null, 2), 'utf8');
  }
}

// Ignore list for non-candidate newsletters / marketing / alerts
const IGNORE_DOMAINS = [
  'accounts.google.com',
  'linkedin.com',
  'bseindia.in',
  'engage.canva.com',
  'mail.salesforce.com',
  'email.openai.com',
  'email.mcafee.com',
  'info.n8n.io',
  'announce.fiverr.com',
  'aspireforher.com'
];

function shouldIgnoreSender(fromAddr) {
  if (!fromAddr) return true;
  const lower = fromAddr.toLowerCase();
  return IGNORE_DOMAINS.some(domain => lower.includes(domain));
}

// Multi-Model Gemini Evaluator
async function callGeminiEvaluation(resumeText, fileName, senderEmail, senderName, emailSubject) {
  const systemInstruction = `
You are an expert Senior Technical Recruiter & Hiring Director for ${CONFIG.companyName}.
Carefully analyze the resume and application content below.

🎯 COMPANY HIRING POLICY (STRICT):
Our company currently has openings ONLY for the following TWO roles:
1. "Full Stack Developer"
2. "Digital Marketing Specialist"

Role & Evaluation Instructions:
1. Infer which of the two active roles the candidate is applying for or best suited for: either "Full Stack Developer" or "Digital Marketing Specialist".
2. If the candidate's background is unrelated to tech or digital marketing, evaluate whether they possess transferable competencies. If not, set decision = 'REJECTED' with an explanation that hiring is currently open only for Full Stack Developer and Digital Marketing Specialist.
3. Extract actual candidate name, contact email, phone (prefer resume header details).
4. Evaluate objectively:
   - decision = 'SELECTED' if matchScore >= ${CONFIG.threshold}
   - decision = 'REJECTED' if matchScore < ${CONFIG.threshold}
5. For SELECTED: generate 4-5 tailored domain interview questions & an interview invitation.
6. For REJECTED: generate constructive feedback points & a respectful rejection letter.

RETURN STRICT JSON ONLY:
{
  "candidateName": "Full Name",
  "candidateEmail": "Candidate Email",
  "candidatePhone": "Candidate Phone or N/A",
  "appliedRole": "Full Stack Developer or Digital Marketing Specialist",
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
  "emailSubject": "Personalized subject line",
  "emailBody": "Personalized professional email text"
}
`;

  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          { text: systemInstruction },
          { text: `ATTACHMENT: ${fileName}\nEMAIL SUBJECT: ${emailSubject}\nSENDER: ${senderName} (${senderEmail})\n\nRESUME / APPLICATION CONTENT:\n${resumeText}` }
        ]
      }
    ],
    generationConfig: { responseMimeType: "application/json" }
  });

  for (const model of CONFIG.models) {
    try {
      console.log(`   🤖 Evaluating with AI Engine (${model})...`);
      const evaluation = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${model}:generateContent?key=${CONFIG.geminiApiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
          timeout: 45000
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            try {
              const respObj = JSON.parse(d);
              if (respObj.error) return reject(new Error(`API ${respObj.error.code}: ${respObj.error.message}`));
              if (!respObj.candidates || !respObj.candidates[0] || !respObj.candidates[0].content) {
                return reject(new Error(`Empty content returned`));
              }
              let raw = respObj.candidates[0].content.parts[0].text;
              raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
              resolve(JSON.parse(raw));
            } catch (err) {
              reject(new Error(`JSON parse error: ${err.message}`));
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('AI Request timed out')); });
        req.write(payload);
        req.end();
      });

      return evaluation;
    } catch (e) {
      console.warn(`   ⚠️ [${model}] ${e.message}. Trying next fallback...`);
    }
  }

  throw new Error("All AI evaluation models failed.");
}

// Candidate Auto-Reply Dispatcher
async function sendCandidateAutoReply(toEmail, subject, bodyText) {
  console.log(`   ✉️ Dispatching auto-reply to "${toEmail}" via Gmail SMTP...`);
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
        <h3 style="color: #6366f1; margin-top: 0;">${CONFIG.companyName} — Application Status Update</h3>
        <p style="white-space: pre-line;">${bodyText}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b;">
          Processed and dispatched automatically by HR Automation Engine.<br>
          Recruiting Mailbox: <strong>${CONFIG.hrEmail}</strong>
        </p>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`   ✅ Auto-reply sent! Message ID: ${info.messageId}`);
  return info;
}

// Process Email
async function processCandidateEmail(buffer, uid) {
  try {
    const parsed = await simpleParser(buffer);
    const fromAddr = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].address : '';
    const fromName = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].name || fromAddr : fromAddr;
    const subject = parsed.subject || '';
    const textBody = parsed.text || '';
    const attachments = parsed.attachments || [];

    // Filter ignore rules
    if (shouldIgnoreSender(fromAddr)) {
      saveProcessedUID(uid);
      return;
    }

    // Check if it has resume attachments OR application keywords
    let hasResumeAttachment = false;
    let resumeText = textBody;
    let fileName = 'Direct Email Application';

    for (const att of attachments) {
      const ext = path.extname(att.filename || '').toLowerCase();
      if (ext === '.pdf' || ext === '.docx' || ext === '.doc') {
        hasResumeAttachment = true;
        fileName = att.filename;
        const uploadPath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(uploadPath, att.content);

        if (ext === '.pdf') {
          try {
            const parser = new PDFParse({ data: att.content });
            const p = await parser.getText();
            await parser.destroy();
            resumeText = p.text || textBody;
          } catch (e) {
            console.error('   ⚠️ PDF text extraction issue:', e.message);
          }
        } else if (ext === '.docx') {
          try {
            const docRes = await mammoth.extractRawText({ buffer: att.content });
            resumeText = docRes.value || textBody;
          } catch (e) {
            console.error('   ⚠️ DOCX extraction issue:', e.message);
          }
        }
        break;
      }
    }

    const subjLower = subject.toLowerCase();
    const isJobKeywords = subjLower.includes('job') || 
                         subjLower.includes('application') || 
                         subjLower.includes('resume') || 
                         subjLower.includes('cv') || 
                         subjLower.includes('engineer') || 
                         subjLower.includes('developer') || 
                         subjLower.includes('marketing');

    // Only process real job applications
    if (!hasResumeAttachment && !isJobKeywords) {
      saveProcessedUID(uid);
      return;
    }

    console.log(`\n===============================================================`);
    console.log(`🔔 [10s POLLER] JOB APPLICATION DETECTED!`);
    console.log(`   From:        ${fromName} <${fromAddr}>`);
    console.log(`   Subject:     ${subject}`);
    console.log(`   Attachment:  ${fileName} (${hasResumeAttachment ? 'Found' : 'None'})`);
    console.log(`   Resume Text: ${resumeText.length} characters`);

    // AI Evaluation
    const evaluation = await callGeminiEvaluation(resumeText, fileName, fromAddr, fromName, subject);

    console.log(`   🎯 Result: ${evaluation.candidateName} -> ${evaluation.decision} (Score: ${evaluation.matchScore}%)`);
    console.log(`   💼 Role:   ${evaluation.appliedRole}`);

    // Auto-Reply Target Email
    const targetEmail = evaluation.candidateEmail || fromAddr;
    await sendCandidateAutoReply(targetEmail, evaluation.emailSubject, evaluation.emailBody);

    // Save to Database
    let candidates = [];
    if (fs.existsSync(DB_FILE)) {
      candidates = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }

    const now = new Date().toISOString();
    const candidateRecord = {
      id: 'cand_auto_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      name: evaluation.candidateName || fromName,
      email: targetEmail,
      phone: evaluation.candidatePhone || 'N/A',
      role: evaluation.appliedRole,
      decision: evaluation.decision,
      matchScore: evaluation.matchScore,
      status: evaluation.decision === 'SELECTED' ? 'INTERVIEW_SCHEDULED' : 'REJECTED',
      yearsOfExperience: evaluation.yearsOfExperience || '1+ Years',
      topSkills: evaluation.topSkills || [],
      education: evaluation.education || 'Graduate',
      strengths: evaluation.strengths || [],
      areasForImprovement: evaluation.areasForImprovement || [],
      evaluationSummary: evaluation.evaluationSummary || '',
      rejectionReason: evaluation.rejectionReason,
      interviewQuestions: evaluation.interviewQuestions || [],
      proposedInterviewDate: evaluation.proposedInterviewDate || 'Upcoming Week',
      interviewStatus: evaluation.decision === 'SELECTED' ? `Interview Invitation Dispatched to ${targetEmail}` : 'N/A',
      emailSubject: evaluation.emailSubject,
      emailBody: evaluation.emailBody,
      emailSentAt: now,
      createdAt: now,
      updatedAt: now,
      source: `Gmail IMAP (${fileName})`
    };

    candidates = candidates.filter(c => c.name !== candidateRecord.name || c.role !== candidateRecord.role);
    candidates.unshift(candidateRecord);
    fs.writeFileSync(DB_FILE, JSON.stringify(candidates, null, 2), 'utf8');

    saveProcessedUID(uid);
    console.log(`   ✅ Live Dashboard Updated! Total Candidates: ${candidates.length}`);
    console.log(`===============================================================\n`);
  } catch (err) {
    console.error('   ❌ Error processing application:', err.message);
    saveProcessedUID(uid);
  }
}

// Polling Cycle
let isPolling = false;

function pollInbox() {
  if (isPolling) return;
  isPolling = true;

  const imap = new Imap({
    user: CONFIG.hrEmail,
    password: CONFIG.appPassword,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  });

  imap.once('ready', () => {
    imap.openBox('[Gmail]/All Mail', false, (err, box) => {
      if (err) {
        isPolling = false;
        try { imap.end(); } catch (e) {}
        return;
      }

      const total = box.messages.total;
      const processedUIDs = getProcessedUIDs();
      const startSeq = Math.max(1, total - 8);
      const endSeq = total;

      const f = imap.seq.fetch(`${startSeq}:${endSeq}`, { bodies: '', struct: true });
      const pending = [];

      f.on('message', (msg, seqno) => {
        let buffer = '';
        let uid = seqno.toString();

        msg.on('attributes', (attrs) => {
          if (attrs && attrs.uid) uid = attrs.uid.toString();
        });

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
        });

        msg.once('end', () => {
          if (!processedUIDs.includes(uid)) {
            pending.push({ buffer, uid });
          }
        });
      });

      f.once('error', (err) => {
        isPolling = false;
        try { imap.end(); } catch (e) {}
      });

      f.once('end', async () => {
        if (pending.length > 0) {
          for (const item of pending) {
            await processCandidateEmail(item.buffer, item.uid);
          }
        }
        isPolling = false;
        try { imap.end(); } catch (e) {}
      });
    });
  });

  imap.once('error', (err) => {
    isPolling = false;
  });

  imap.connect();
}

console.log('===============================================================');
console.log(` 🚀 PRODUCTION 10-SECOND CONTINUOUS EMAIL WATCHER RUNNING`);
console.log(` 📧 Recruiter Mailbox: ${CONFIG.hrEmail}`);
console.log(` ⏱️ Polling Frequency: Every 10 Seconds`);
console.log(` 🤖 AI Models Active:  ${CONFIG.models.join(' ➔ ')}`);
console.log(` 🌐 Live HR Dashboard: http://localhost:3000`);
console.log('===============================================================');

// Initial check immediately
pollInbox();

// Run every 10 seconds continuously
setInterval(pollInbox, CONFIG.pollIntervalMs);
