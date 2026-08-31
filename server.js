const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Global safety error traps
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Server Uncaught Exception]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Server Unhandled Rejection]:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'candidates_db.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const PROCESSED_UIDS_FILE = path.join(__dirname, 'processed_email_uids.json');

// Ensure directories exist
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `resume_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Default Config
let appConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY",
  models: ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.7-flash"],
  hrEmail: process.env.HR_EMAIL || "manasvipaliwal317@gmail.com",
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || "YOUR_GMAIL_APP_PASSWORD",
  selectionScoreThreshold: Number(process.env.SELECTION_SCORE_THRESHOLD) || 70,
  companyName: process.env.COMPANY_NAME || "Tech Innovations Inc.",
  autoSendEmails: process.env.AUTO_SEND_EMAILS !== undefined ? process.env.AUTO_SEND_EMAILS === 'true' : true
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    appConfig = { ...appConfig, ...saved };
  } catch (e) {
    console.error("Config load error:", e);
  }
}

// Override with process.env if present
if (process.env.GEMINI_API_KEY) appConfig.geminiApiKey = process.env.GEMINI_API_KEY.trim();
if (process.env.HR_EMAIL) appConfig.hrEmail = process.env.HR_EMAIL.trim();
if (process.env.GMAIL_APP_PASSWORD) appConfig.gmailAppPassword = process.env.GMAIL_APP_PASSWORD.trim();
if (process.env.COMPANY_NAME) appConfig.companyName = process.env.COMPANY_NAME.trim();

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 'utf8');
}

// Helper: read candidates
function getCandidates() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, '[]', 'utf8');
      return [];
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error("DB read error:", e);
    return [];
  }
}

function saveCandidates(candidates) {
  fs.writeFileSync(DB_FILE, JSON.stringify(candidates, null, 2), 'utf8');
}

// Helper: Processed UIDs
function getProcessedUIDs() {
  try {
    if (fs.existsSync(PROCESSED_UIDS_FILE)) {
      return JSON.parse(fs.readFileSync(PROCESSED_UIDS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function markUIDProcessed(uid) {
  const list = getProcessedUIDs();
  const uidStr = uid.toString();
  if (!list.includes(uidStr)) {
    list.push(uidStr);
    if (list.length > 500) list.shift();
    fs.writeFileSync(PROCESSED_UIDS_FILE, JSON.stringify(list, null, 2), 'utf8');
  }
}

// Extract text from document
async function extractTextFromDoc(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  try {
    if (ext === '.pdf') {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      await parser.destroy();
      return parsed.text || '';
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } else {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (e) {
    console.error("File extraction error:", e);
    return '';
  }
}

// Multi-Model Gemini Evaluator with Automatic Retry & Failover
async function callGeminiEvaluation({ candidateName, candidateEmail, appliedRole, resumeText, emailBody, fileName }) {
  const systemInstruction = `
You are an expert Senior Technical Recruiter & Hiring Director for ${appConfig.hrEmail} at ${appConfig.companyName}.
Carefully analyze the candidate's resume content, skills, experience, and application details.

🎯 COMPANY HIRING POLICY (STRICT):
Our company currently has openings ONLY for the following TWO roles:
1. "Full Stack Developer"
2. "Digital Marketing Specialist"

Role & Evaluation Instructions:
1. Role Identification & Mapping:
   - Determine which of the two active roles the candidate is applying for or best qualified for: "Full Stack Developer" or "Digital Marketing Specialist".
   - If the applicant is targeting or applying for an unrelated position (or has non-transferable experience outside tech/marketing), evaluate whether they have transferable skills for either role. If not, set decision to 'REJECTED' with an explanation that openings are currently limited to Full Stack Developer and Digital Marketing Specialist.
2. Extract actual candidate name, contact email, phone (prioritize details found inside the resume text).
3. Role-Specific Evaluation Standards:
   - For "Full Stack Developer": Evaluate proficiency in Frontend (React/Vue/Angular, HTML/CSS, JavaScript/TypeScript), Backend (Node.js, Python, Java, APIs), Database management (SQL/NoSQL), Git, system architecture, and modern web development practices.
   - For "Digital Marketing Specialist": Evaluate expertise in SEO/SEM, Paid Advertising (Google Ads, Meta Ads), Social Media Marketing, Content Strategy, Web Analytics/GA4, Lead Generation, ROI optimization, and Campaign Management.
   - If matchScore >= ${appConfig.selectionScoreThreshold}, decision = 'SELECTED'.
   - If matchScore < ${appConfig.selectionScoreThreshold}, decision = 'REJECTED'.
4. For SELECTED: generate 4-5 tailored domain interview questions & an interview invitation email with proposed schedule slots for the matched role.
5. For REJECTED: generate constructive growth recommendations & a respectful rejection email referencing our current openings for Full Stack Developer and Digital Marketing Specialist.

RETURN STRICT JSON ONLY (no markdown formatting, no code fences):
{
  "candidateName": "Extracted Full Name",
  "candidateEmail": "${candidateEmail || 'Extracted Email'}",
  "candidatePhone": "Extracted Phone or N/A",
  "appliedRole": "${appliedRole || 'Target Role'}",
  "decision": "SELECTED" or "REJECTED",
  "matchScore": number (0 to 100),
  "yearsOfExperience": "Years of experience (e.g. '3 years' or 'Fresher')",
  "topSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "education": "Degree and University",
  "strengths": ["Clear strength 1", "Clear strength 2", "Clear strength 3"],
  "areasForImprovement": ["Constructive point 1", "Constructive point 2"],
  "evaluationSummary": "Comprehensive 2-3 paragraph professional recruiter assessment",
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
          {
            text: `RESUME FILE: ${fileName || 'resume.pdf'}\nSENDER HINT: ${candidateName || 'N/A'} <${candidateEmail || 'N/A'}>\nEMAIL COVER NOTE:\n${emailBody || 'Please review my resume.'}\n\nFULL RESUME TEXT:\n${resumeText || 'No text extracted'}`
          }
        ]
      }
    ],
    generationConfig: { responseMimeType: "application/json" }
  });

  const modelsToTry = appConfig.models || ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash'];

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`🤖 Evaluating with ${model} (attempt ${attempt})...`);
        const evaluation = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${model}:generateContent?key=${appConfig.geminiApiKey}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 45000
          }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const respObj = JSON.parse(data);
                if (respObj.error) {
                  return reject(new Error(`API ${respObj.error.code}: ${respObj.error.message}`));
                }
                if (!respObj.candidates || !respObj.candidates[0] || !respObj.candidates[0].content) {
                  return reject(new Error(`Empty output from Gemini`));
                }
                let rawText = respObj.candidates[0].content.parts[0].text;
                rawText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
                resolve(JSON.parse(rawText));
              } catch (e) {
                reject(new Error(`JSON Parse Error: ${e.message}`));
              }
            });
          });

          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('AI Request Timeout')); });
          req.write(payload);
          req.end();
        });

        console.log(`✅ AI Evaluation succeeded with ${model}!`);
        return evaluation;
      } catch (err) {
        console.warn(`⚠️ [${model} Attempt ${attempt}] ${err.message}`);
        if (attempt === 1) await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw new Error("All AI models failed or experienced high demand.");
}

// Nodemailer helper
async function sendCandidateEmail(toEmail, subject, bodyText) {
  const cleanPassword = (appConfig.gmailAppPassword || '').replace(/\s+/g, '');
  if (!cleanPassword) {
    console.log(`[Email Skipped] No app password configured`);
    return { success: false, error: "App Password missing" };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: appConfig.hrEmail,
      pass: cleanPassword
    }
  });

  const mailOptions = {
    from: `"${appConfig.companyName} Recruitment Team" <${appConfig.hrEmail}>`,
    to: toEmail,
    subject: subject,
    text: bodyText,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; line-height: 1.6; color: #333; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h3 style="color: #6366f1; margin-top: 0;">${appConfig.companyName} — Application Status</h3>
        <p style="white-space: pre-line;">${bodyText}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b;">
          Processed and dispatched automatically by our HR Automation System.<br>
          Recruiter Inbox: <strong>${appConfig.hrEmail}</strong>
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ [Live Email Sent] ID: ${info.messageId} to ${toEmail}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ [Email Dispatch Error]:", err.message);
    return { success: false, error: err.message };
  }
}

// ----------------- SERVER-SENT EVENTS (SSE) FOR INSTANT DASHBOARD UPDATES ----------------- //
let sseClients = [];

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => client.res.write(msg));
}

app.get('/api/live-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  sseClients.push({ id: clientId, res });

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date() })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// ----------------- AUTOMATED REAL-TIME INBOX SCANNER ----------------- //
const scannerStats = {
  active: true,
  lastScanTime: null,
  totalScans: 0,
  resumesProcessed: 0,
  lastCandidateName: null,
  status: "Listening on INBOX"
};

let isScanInProgress = false;

// Process a verified candidate email with resume
async function processCandidateEmailRecord(parsed, uid) {
  const fromAddr = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].address : '';
  const fromName = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].name || fromAddr : fromAddr;
  const subject = parsed.subject || 'Job Application';
  const textBody = parsed.text || '';
  const attachments = parsed.attachments || [];

  // STRICT FILTER: Must have at least ONE resume attachment (.pdf, .docx, .doc)
  const resumeAttachment = attachments.find(att => {
    const ext = path.extname(att.filename || '').toLowerCase();
    return ext === '.pdf' || ext === '.docx' || ext === '.doc';
  });

  if (!resumeAttachment) {
    // NOT A RESUME -> SKIP COMPLETELY!
    markUIDProcessed(uid);
    return false;
  }

  console.log(`\n===============================================================`);
  console.log(`🎯 [INBOX AUTO-SCANNER] NEW RESUME DETECTED!`);
  console.log(`   From:        ${fromName} <${fromAddr}>`);
  console.log(`   Subject:     ${subject}`);
  console.log(`   Attachment:  ${resumeAttachment.filename} (${resumeAttachment.size} bytes)`);

  const fileName = resumeAttachment.filename || 'resume.pdf';
  const uploadPath = path.join(UPLOAD_DIR, fileName);
  fs.writeFileSync(uploadPath, resumeAttachment.content);

  let resumeText = '';
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') {
    try {
      const parser = new PDFParse({ data: resumeAttachment.content });
      const p = await parser.getText();
      await parser.destroy();
      resumeText = p.text || textBody;
    } catch (e) {
      resumeText = textBody;
    }
  } else if (ext === '.docx') {
    try {
      const docRes = await mammoth.extractRawText({ buffer: resumeAttachment.content });
      resumeText = docRes.value || textBody;
    } catch (e) {
      resumeText = textBody;
    }
  }

  // Infer Target Role (Strictly Full Stack Developer or Digital Marketing Specialist)
  let appliedRole = 'Full Stack Developer';
  const combined = (subject + ' ' + textBody + ' ' + resumeText).toLowerCase();
  if (
    combined.includes('digital marketing') ||
    combined.includes('marketing') ||
    combined.includes('seo') ||
    combined.includes('sem') ||
    combined.includes('social media') ||
    combined.includes('content strategist') ||
    combined.includes('growth marketing') ||
    combined.includes('google ads') ||
    combined.includes('meta ads') ||
    combined.includes('campaign') ||
    combined.includes('copywriting') ||
    combined.includes('performance marketing')
  ) {
    appliedRole = 'Digital Marketing Specialist';
  } else {
    appliedRole = 'Full Stack Developer';
  }

  // Call Gemini Evaluation
  const evaluation = await callGeminiEvaluation({
    candidateName: fromName,
    candidateEmail: fromAddr,
    appliedRole,
    resumeText,
    emailBody: textBody,
    fileName
  });

  console.log(`   🎯 Decision: ${evaluation.candidateName} -> ${evaluation.decision} (${evaluation.matchScore}%)`);

  // Target Email: prefer extracted email if found, fallback to sender
  const targetEmail = evaluation.candidateEmail || fromAddr;
  await sendCandidateEmail(targetEmail, evaluation.emailSubject, evaluation.emailBody);

  // Save Candidate
  let candidates = getCandidates();
  const now = new Date().toISOString();
  const candidateRecord = {
    id: 'cand_auto_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    name: evaluation.candidateName || fromName,
    email: targetEmail,
    phone: evaluation.candidatePhone || 'N/A',
    role: evaluation.appliedRole || appliedRole,
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
  saveCandidates(candidates);
  markUIDProcessed(uid);

  scannerStats.resumesProcessed++;
  scannerStats.lastCandidateName = candidateRecord.name;

  // Broadcast Real-Time SSE to Dashboard
  broadcastSSE('candidate_added', {
    candidate: candidateRecord,
    total: candidates.length
  });

  console.log(`   ✅ Candidate broadcasted to Live Dashboard! Total: ${candidates.length}`);
  console.log(`===============================================================\n`);
  return true;
}

// Single Scan of INBOX
async function scanInboxNow() {
  if (isScanInProgress) return;
  isScanInProgress = true;

  const cleanPassword = (appConfig.gmailAppPassword || '').replace(/\s+/g, '');
  if (!cleanPassword) {
    isScanInProgress = false;
    return;
  }

  const imap = new Imap({
    user: appConfig.hrEmail,
    password: cleanPassword,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  });

  imap.once('ready', () => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        isScanInProgress = false;
        try { imap.end(); } catch (e) {}
        return;
      }

      scannerStats.lastScanTime = new Date().toISOString();
      scannerStats.totalScans++;

      const total = box.messages.total;
      const processedUIDs = getProcessedUIDs();
      // Fetch latest 10 messages
      const startSeq = Math.max(1, total - 10);
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
          stream.on('data', chunk => buffer += chunk.toString('utf8'));
        });

        msg.once('end', () => {
          if (!processedUIDs.includes(uid)) {
            pending.push({ buffer, uid });
          }
        });
      });

      f.once('error', () => {
        isScanInProgress = false;
        try { imap.end(); } catch (e) {}
      });

      f.once('end', async () => {
        if (pending.length > 0) {
          for (const item of pending) {
            try {
              const parsed = await simpleParser(item.buffer);
              await processCandidateEmailRecord(parsed, item.uid);
            } catch (pErr) {
              console.error('Email parse error:', pErr.message);
              markUIDProcessed(item.uid);
            }
          }
        }
        isScanInProgress = false;
        try { imap.end(); } catch (e) {}
      });
    });
  });

  imap.once('error', () => {
    isScanInProgress = false;
  });

  imap.connect();
}

// ----------------- ROUTES ----------------- //

// 1. Scanner Telemetry Status
app.get('/api/scanner-status', (req, res) => {
  res.json({
    success: true,
    stats: {
      ...scannerStats,
      mailbox: appConfig.hrEmail,
      frequency: "Every 5 Seconds (Continuous Live INBOX Watcher)",
      filterRule: "STRICT: Only emails with .pdf, .docx, .doc resume attachments"
    }
  });
});

// 2. Manual Immediate Trigger
app.post('/api/scan-inbox', async (req, res) => {
  console.log("⚡ [Manual Trigger] Scanning INBOX immediately upon user request...");
  scanInboxNow();
  res.json({ success: true, message: "INBOX scan triggered immediately!" });
});

// 3. Get candidates
app.get('/api/candidates', (req, res) => {
  let list = getCandidates();
  const { status, decision, search, role } = req.query;

  if (decision && decision !== 'ALL') {
    list = list.filter(c => c.decision === decision);
  }
  if (status && status !== 'ALL') {
    list = list.filter(c => c.status === status);
  }
  if (role && role !== 'ALL') {
    list = list.filter(c => c.role === role);
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(c =>
      (c.name && c.name.toLowerCase().includes(s)) ||
      (c.email && c.email.toLowerCase().includes(s)) ||
      (c.role && c.role.toLowerCase().includes(s)) ||
      (c.topSkills && c.topSkills.some(sk => sk.toLowerCase().includes(s)))
    );
  }

  res.json({ success: true, total: list.length, candidates: list });
});

// 4. Get single candidate
app.get('/api/candidates/:id', (req, res) => {
  const list = getCandidates();
  const candidate = list.find(c => c.id === req.params.id);
  if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });
  res.json({ success: true, candidate });
});

// 4b. Create or sync candidate from n8n workflow or direct API
app.post('/api/candidates', (req, res) => {
  try {
    const candidateData = req.body;
    if (!candidateData || (!candidateData.name && !candidateData.candidateName && !candidateData.email && !candidateData.candidateEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid candidate payload' });
    }

    const now = new Date().toISOString();
    const candidateRecord = {
      id: candidateData.id || ('cand_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6)),
      name: candidateData.name || candidateData.candidateName || 'Candidate',
      email: candidateData.email || candidateData.candidateEmail || 'N/A',
      phone: candidateData.phone || candidateData.candidatePhone || 'N/A',
      role: candidateData.role || candidateData.appliedRole || 'General Candidate',
      decision: candidateData.decision || (Number(candidateData.matchScore) >= (appConfig.selectionScoreThreshold || 70) ? 'SELECTED' : 'REJECTED'),
      matchScore: Number(candidateData.matchScore) || 75,
      status: candidateData.status || (candidateData.decision === 'SELECTED' ? 'INTERVIEW_SCHEDULED' : 'REJECTED'),
      yearsOfExperience: candidateData.yearsOfExperience || 'N/A',
      topSkills: Array.isArray(candidateData.topSkills) ? candidateData.topSkills : [],
      education: candidateData.education || 'N/A',
      strengths: Array.isArray(candidateData.strengths) ? candidateData.strengths : [],
      areasForImprovement: Array.isArray(candidateData.areasForImprovement) ? candidateData.areasForImprovement : [],
      evaluationSummary: candidateData.evaluationSummary || '',
      rejectionReason: candidateData.rejectionReason || null,
      interviewQuestions: Array.isArray(candidateData.interviewQuestions) ? candidateData.interviewQuestions : [],
      proposedInterviewDate: candidateData.proposedInterviewDate || 'Upcoming Week',
      interviewStatus: candidateData.interviewStatus || (candidateData.decision === 'SELECTED' ? 'Interview Scheduled' : 'N/A'),
      emailSubject: candidateData.emailSubject || '',
      emailBody: candidateData.emailBody || '',
      emailSentAt: candidateData.emailSentAt || now,
      createdAt: candidateData.createdAt || now,
      updatedAt: now,
      source: candidateData.source || 'Direct API Sync'
    };

    let candidates = getCandidates();
    candidates = candidates.filter(c => c.id !== candidateRecord.id && !(c.name === candidateRecord.name && c.role === candidateRecord.role));
    candidates.unshift(candidateRecord);
    saveCandidates(candidates);

    broadcastSSE('candidate_added', { candidate: candidateRecord, total: candidates.length });

    res.json({ success: true, count: candidates.length, candidates: candidates, candidate: candidateRecord });
  } catch (err) {
    console.error("Save candidate error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Direct Manual Evaluation from Web Form / Lab (Supports both /api/evaluate and /api/evaluate-resume)
const uploadFields = upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'resumeFile', maxCount: 1 }
]);

async function handleEvaluationRequest(req, res) {
  try {
    const { candidateName, candidateEmail, appliedRole, emailBody, resumeTextInput, resumeText } = req.body;
    let resumeContent = resumeTextInput || resumeText || '';
    let fileName = 'Direct Submission';

    let file = req.file;
    if (!file && req.files) {
      file = (req.files.resume && req.files.resume[0]) || (req.files.resumeFile && req.files.resumeFile[0]);
    }

    if (file) {
      fileName = file.originalname;
      const extracted = await extractTextFromDoc(file.path, file.originalname);
      resumeContent = extracted || resumeContent;
    }

    if (!resumeContent.trim()) {
      return res.status(400).json({ success: false, error: 'No resume text or valid file provided' });
    }

    const evaluation = await callGeminiEvaluation({
      candidateName,
      candidateEmail,
      appliedRole,
      resumeText: resumeContent,
      emailBody,
      fileName
    });

    const now = new Date().toISOString();
    const candidateRecord = {
      id: 'cand_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      name: evaluation.candidateName || candidateName || 'Candidate',
      email: candidateEmail || evaluation.candidateEmail || 'N/A',
      phone: evaluation.candidatePhone || 'N/A',
      role: appliedRole || evaluation.appliedRole || 'Software Engineer',
      decision: evaluation.decision,
      matchScore: evaluation.matchScore,
      status: evaluation.decision === 'SELECTED' ? 'INTERVIEW_SCHEDULED' : 'REJECTED',
      yearsOfExperience: evaluation.yearsOfExperience || 'N/A',
      topSkills: evaluation.topSkills || [],
      education: evaluation.education || 'N/A',
      strengths: evaluation.strengths || [],
      areasForImprovement: evaluation.areasForImprovement || [],
      evaluationSummary: evaluation.evaluationSummary || '',
      rejectionReason: evaluation.rejectionReason,
      interviewQuestions: evaluation.interviewQuestions || [],
      proposedInterviewDate: evaluation.proposedInterviewDate || 'Next Week',
      interviewStatus: evaluation.decision === 'SELECTED' ? 'Invitation Sent' : 'N/A',
      emailSubject: evaluation.emailSubject,
      emailBody: evaluation.emailBody,
      emailSentAt: now,
      createdAt: now,
      updatedAt: now,
      source: fileName === 'Direct Submission' ? 'Dashboard Submission' : `File Upload (${fileName})`
    };

    if (candidateEmail && candidateEmail.includes('@') && appConfig.autoSendEmails) {
      await sendCandidateEmail(candidateEmail, evaluation.emailSubject, evaluation.emailBody);
    }

    let candidates = getCandidates();
    candidates = candidates.filter(c => c.id !== candidateRecord.id && !(c.name === candidateRecord.name && c.role === candidateRecord.role));
    candidates.unshift(candidateRecord);
    saveCandidates(candidates);

    broadcastSSE('candidate_added', { candidate: candidateRecord, total: candidates.length });

    res.json({ success: true, candidate: candidateRecord, evaluation });
  } catch (err) {
    console.error("Evaluation error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

app.post('/api/evaluate-resume', uploadFields, handleEvaluationRequest);
app.post('/api/evaluate', uploadFields, handleEvaluationRequest);

// 6. Update candidate status (Supports both PATCH and PUT)
function handleCandidateStatusUpdate(req, res) {
  const { status, interviewStatus, interviewDate } = req.body;
  const list = getCandidates();
  const index = list.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, error: 'Candidate not found' });

  if (status) list[index].status = status;
  if (interviewStatus) list[index].interviewStatus = interviewStatus;
  if (interviewDate) list[index].proposedInterviewDate = interviewDate;
  list[index].updatedAt = new Date().toISOString();

  saveCandidates(list);
  broadcastSSE('candidate_updated', { candidate: list[index] });
  res.json({ success: true, candidate: list[index] });
}

app.patch('/api/candidates/:id/status', handleCandidateStatusUpdate);
app.put('/api/candidates/:id/status', handleCandidateStatusUpdate);

// 7. Delete candidate
app.delete('/api/candidates/:id', (req, res) => {
  let list = getCandidates();
  list = list.filter(c => c.id !== req.params.id);
  saveCandidates(list);
  broadcastSSE('candidate_deleted', { id: req.params.id, total: list.length });
  res.json({ success: true, message: 'Candidate deleted' });
});

// 8. KPI Analytics & Stats (Supports both /api/analytics and /api/stats)
function getAnalyticsStats(req, res) {
  const list = getCandidates();
  const total = list.length;
  const selected = list.filter(c => c.decision === 'SELECTED').length;
  const rejected = list.filter(c => c.decision === 'REJECTED').length;
  const interviewScheduled = list.filter(c => c.status === 'INTERVIEW_SCHEDULED').length;
  const offerExtended = list.filter(c => c.status === 'OFFER_EXTENDED').length;

  const totalScore = list.reduce((acc, c) => acc + (Number(c.matchScore) || 0), 0);
  const avgScore = total > 0 ? Math.round(totalScore / total) : 0;
  const selectionRate = total > 0 ? Math.round((selected / total) * 100) : 0;

  const skillCounts = {};
  list.forEach(c => {
    (c.topSkills || []).forEach(s => {
      const trimmed = (s || '').trim();
      if (trimmed) skillCounts[trimmed] = (skillCounts[trimmed] || 0) + 1;
    });
  });
  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  const roleMap = {};
  list.forEach(c => {
    const r = c.role || 'Unspecified';
    roleMap[r] = (roleMap[r] || 0) + 1;
  });

  res.json({
    success: true,
    total,
    selected,
    rejected,
    interviewScheduled,
    offerExtended,
    avgScore,
    selectionRate,
    topSkills,
    roleDistribution: roleMap
  });
}

app.get('/api/analytics', getAnalyticsStats);
app.get('/api/stats', getAnalyticsStats);

// 9. Manual Email Resend
app.post('/api/send-email', async (req, res) => {
  try {
    const { candidateId, toEmail, subject, body } = req.body;
    if (!toEmail || !subject || !body) {
      return res.status(400).json({ success: false, error: 'Missing required email parameters' });
    }
    const result = await sendCandidateEmail(toEmail, subject, body);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Test n8n Webhook Endpoint
app.post('/api/test-n8n', (req, res) => {
  try {
    const payload = JSON.stringify({
      test: true,
      senderEmail: appConfig.hrEmail,
      candidateName: "Test Applicant",
      appliedRole: "Senior Full Stack Engineer",
      resumeText: "Test Resume payload for automated recruitment pipeline verification."
    });

    const webhookUrl = appConfig.n8nWebhookUrl || 'http://localhost:5678/webhook/hr-resume-submit';
    const parsed = new URL(webhookUrl);
    const client = parsed.protocol === 'https:' ? https : require('http');

    const nReq = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 4000
    }, (nRes) => {
      res.json({ success: true, statusCode: nRes.statusCode, message: `n8n webhook triggered (Status ${nRes.statusCode})` });
    });

    nReq.on('error', (e) => {
      res.json({ success: false, error: `n8n server connection issue: ${e.message}` });
    });
    nReq.on('timeout', () => {
      nReq.destroy();
      res.json({ success: false, error: 'n8n request timed out' });
    });
    nReq.write(payload);
    nReq.end();
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 11. Settings
app.get('/api/settings', (req, res) => {
  res.json({ success: true, config: appConfig });
});

app.post('/api/settings', (req, res) => {
  const { geminiApiKey, gmailAppPassword, hrEmail, selectionScoreThreshold, autoSendEmails, companyName } = req.body;
  if (geminiApiKey) appConfig.geminiApiKey = geminiApiKey.trim();
  if (gmailAppPassword !== undefined) appConfig.gmailAppPassword = gmailAppPassword.trim();
  if (hrEmail) appConfig.hrEmail = hrEmail.trim();
  if (selectionScoreThreshold !== undefined) appConfig.selectionScoreThreshold = Number(selectionScoreThreshold);
  if (autoSendEmails !== undefined) appConfig.autoSendEmails = Boolean(autoSendEmails);
  if (companyName) appConfig.companyName = companyName.trim();

  saveConfig();
  res.json({ success: true, message: "Settings updated successfully", config: appConfig });
});

// Start Server and Automated Background Loop
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 🚀 NEXUS HR REAL-TIME SERVER ACTIVE (PORT ${PORT})`);
  console.log(` 🌐 Dashboard: http://localhost:${PORT}`);
  console.log(` 📧 Watching:  ${appConfig.hrEmail}`);
  console.log(` ⏱️ Frequency: Every 5 Seconds (Continuous Automated Scan)`);
  console.log(` 🎯 Filter:    STRICT (.pdf / .docx / .doc Resumes ONLY)`);
  console.log(` 🤖 AI Models: ${appConfig.models.join(' ➔ ')}`);
  console.log(`=======================================================`);

  // Initial Scan on startup
  scanInboxNow();

  // Run automated scan every 5 seconds continuously
  setInterval(scanInboxNow, 5000);
});
