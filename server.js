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
const JOB_ROLES_FILE = path.join(__dirname, 'job_roles.json');

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

// Universal Anti-caching middleware so HR Dashboard HTML, CSS, JS, and API never get stuck in browser cache
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0
}));
const websiteDir = path.join(__dirname, 'tech-innovations-inc');

app.get(['/website', '/website/'], (req, res) => {
  res.sendFile(path.join(websiteDir, 'index.html'));
});
app.get(['/site', '/site/'], (req, res) => {
  res.sendFile(path.join(websiteDir, 'index.html'));
});
app.get(['/company', '/company/'], (req, res) => {
  res.sendFile(path.join(websiteDir, 'index.html'));
});
app.get(['/careers', '/careers/'], (req, res) => {
  res.sendFile(path.join(websiteDir, 'careers.html'));
});

const staticOptions = {
  extensions: ['html', 'htm'],
  etag: false,
  lastModified: false,
  maxAge: 0
};

app.use('/website', express.static(websiteDir, staticOptions));
app.use('/site', express.static(websiteDir, staticOptions));
app.use('/company', express.static(websiteDir, staticOptions));
app.use('/tech-innovations-inc', express.static(websiteDir, staticOptions));

// Default Config
let appConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY",
  models: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-3.6-flash"],
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

// ----------------- DYNAMIC JOB OPENINGS & ROLES MANAGER ----------------- //
const DEFAULT_JOB_ROLES = [
  {
    id: "role_fullstack",
    title: "Full Stack Developer",
    department: "Engineering",
    isActive: true,
    requiredSkills: ["React", "Node.js", "Express", "PostgreSQL", "REST APIs", "TypeScript", "Git", "System Architecture"],
    minExperience: "2+ Years",
    description: "Designing and developing full-stack web applications, RESTful APIs, responsive frontends, and database architectures."
  },
  {
    id: "role_marketing",
    title: "Digital Marketing Specialist",
    department: "Growth & Marketing",
    isActive: true,
    requiredSkills: ["SEO", "SEM", "Google Ads", "Meta Ads Manager", "GA4", "Content Strategy", "Conversion Funnels", "Campaign Optimization"],
    minExperience: "1+ Years",
    description: "Managing paid acquisition campaigns, search engine optimization (SEO), performance marketing funnels, and growth analytics."
  },
  {
    id: "role_frontend",
    title: "Frontend React Developer",
    department: "Engineering",
    isActive: false,
    requiredSkills: ["React", "JavaScript (ES6+)", "HTML5/CSS3", "Tailwind CSS", "Next.js", "State Management", "Responsive UI"],
    minExperience: "2+ Years",
    description: "Crafting intuitive, pixel-perfect, responsive user interfaces and modern web applications using React."
  },
  {
    id: "role_ai_ml",
    title: "AI / ML Engineer",
    department: "AI Research",
    isActive: false,
    requiredSkills: ["Python", "TensorFlow", "PyTorch", "LLMs", "RAG Pipelines", "Prompt Engineering", "Embeddings", "FastAPI"],
    minExperience: "2+ Years",
    description: "Designing and deploying machine learning models, LLM-powered applications, retrieval-augmented generation (RAG), and AI workflows."
  },
  {
    id: "role_ui_ux",
    title: "UI/UX Product Designer",
    department: "Product & Design",
    isActive: false,
    requiredSkills: ["Figma", "Design Systems", "User Research", "Wireframing", "Interactive Prototyping", "Usability Testing"],
    minExperience: "1+ Years",
    description: "Creating user-centric product designs, intuitive workflows, design system components, and interactive prototypes."
  },
  {
    id: "role_backend",
    title: "Backend Systems Engineer",
    department: "Engineering",
    isActive: false,
    requiredSkills: ["Node.js", "Go", "Python", "PostgreSQL", "Redis", "Microservices", "Docker", "Kafka / RabbitMQ"],
    minExperience: "3+ Years",
    description: "Architecting resilient, high-throughput backend services, distributed systems, caching layers, and database schemas."
  }
];

function getJobRoles() {
  try {
    if (!fs.existsSync(JOB_ROLES_FILE)) {
      fs.writeFileSync(JOB_ROLES_FILE, JSON.stringify(DEFAULT_JOB_ROLES, null, 2), 'utf8');
      return DEFAULT_JOB_ROLES;
    }
    return JSON.parse(fs.readFileSync(JOB_ROLES_FILE, 'utf8'));
  } catch (e) {
    console.error("Job roles read error:", e);
    return DEFAULT_JOB_ROLES;
  }
}

function saveJobRoles(roles) {
  fs.writeFileSync(JOB_ROLES_FILE, JSON.stringify(roles, null, 2), 'utf8');
}

function getActiveJobRoles() {
  const roles = getJobRoles();
  const active = roles.filter(r => r.isActive);
  return active.length > 0 ? active : roles; // Fallback to all if none explicitly active
}

function buildRolePromptInstructions() {
  const activeRoles = getActiveJobRoles();
  const roleNames = activeRoles.map(r => `"${r.title}"`).join(', ');
  
  let instructions = `🎯 COMPANY HIRING POLICY & CURRENT ACTIVE OPENINGS:\n`;
  instructions += `Our company currently has hiring openings ONLY for the following ${activeRoles.length} active role(s):\n`;
  activeRoles.forEach((r, idx) => {
    instructions += `${idx + 1}. "${r.title}" (${r.department || 'General'})\n`;
    if (r.requiredSkills && r.requiredSkills.length > 0) {
      instructions += `   - Key Required Skills: ${r.requiredSkills.join(', ')}\n`;
    }
    if (r.minExperience) {
      instructions += `   - Minimum Experience: ${r.minExperience}\n`;
    }
    if (r.description) {
      instructions += `   - Role Scope: ${r.description}\n`;
    }
  });

  instructions += `\nRole & Evaluation Rules:\n`;
  instructions += `1. Evaluate the candidate SOLELY against the ${activeRoles.length} active opening(s) listed above: ${roleNames}.\n`;
  instructions += `2. Best Match Determination:\n`;
  instructions += `   - Map the applicant's experience, skills, and background to the most relevant OPEN role among: ${roleNames}.\n`;
  instructions += `   - Set "appliedRole" to that exact matched active role.\n`;
  instructions += `   - If the candidate's skills or targeted position do NOT match any of our active opening(s) (${roleNames}), set decision to 'REJECTED' with an explanation that hiring is currently open only for: ${roleNames}.\n`;
  instructions += `3. Score Calculation:\n`;
  instructions += `   - If matchScore >= ${appConfig.selectionScoreThreshold}, decision = 'SELECTED'.\n`;
  instructions += `   - If matchScore < ${appConfig.selectionScoreThreshold}, decision = 'REJECTED'.\n`;
  instructions += `4. If SELECTED: generate 4-5 domain interview questions tailored to the matched active role and proposed interview schedule.\n`;
  instructions += `5. If REJECTED: generate constructive feedback referencing our current openings: ${roleNames}.\n`;

  return { instructions, activeRoles, roleNames };
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

// ----------------- CLOUD BIDIRECTIONAL SYNC & KEEP-ALIVE ----------------- //
const CLOUD_RENDER_URL = process.env.CLOUD_RENDER_URL || 'https://nexus-hr-workflow.onrender.com';

// ☁️ Forward candidate update immediately to Render.com cloud instance
async function syncCandidateToCloud(candidate) {
  if (process.env.RENDER || process.env.PORT === '10000') return; // Don't loop sync to itself
  if (!candidate) return;

  try {
    const payload = JSON.stringify(candidate);
    const parsedUrl = new URL(CLOUD_RENDER_URL + '/api/candidates');
    const client = parsedUrl.protocol === 'https:' ? https : require('http');

    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 8000
    }, (res) => {
      let respData = '';
      res.on('data', c => respData += c);
      res.on('end', () => {
        console.log(`☁️ [Render Cloud Push] Synced candidate "${candidate.name}" to ${CLOUD_RENDER_URL} (Status ${res.statusCode})`);
      });
    });

    req.on('error', (err) => {
      console.warn(`☁️ [Render Sync Notice]: ${err.message}`);
    });
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
  } catch (e) {}
}

// ☁️ Forward full database in bulk to Render.com
async function syncAllCandidatesToCloud() {
  if (process.env.RENDER || process.env.PORT === '10000') return;
  const all = getCandidates();
  if (!all || all.length === 0) return;

  try {
    const payload = JSON.stringify({ candidates: all });
    const parsedUrl = new URL(CLOUD_RENDER_URL + '/api/candidates/sync-bulk');
    const client = parsedUrl.protocol === 'https:' ? https : require('http');

    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, (res) => {
      let respData = '';
      res.on('data', c => respData += c);
      res.on('end', () => {
        console.log(`☁️ [Render Cloud Bulk Sync] Pushed ${all.length} candidates to ${CLOUD_RENDER_URL} (Status ${res.statusCode})`);
      });
    });

    req.on('error', (err) => {
      console.warn(`☁️ [Render Bulk Sync Notice]: ${err.message}`);
    });
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
  } catch (e) {}
}

// ☁️ Forward candidate deletion to Render.com cloud instance
async function deleteCandidateOnCloud(candidateId) {
  if (process.env.RENDER || process.env.PORT === '10000') return;
  if (!candidateId) return;

  try {
    const parsedUrl = new URL(`${CLOUD_RENDER_URL}/api/candidates/${candidateId}`);
    const client = parsedUrl.protocol === 'https:' ? https : require('http');

    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'DELETE',
      timeout: 8000
    }, (res) => {
      console.log(`☁️ [Render Cloud Delete] Deleted candidate "${candidateId}" on ${CLOUD_RENDER_URL} (Status ${res.statusCode})`);
    });

    req.on('error', (err) => {
      console.warn(`☁️ [Render Delete Notice]: ${err.message}`);
    });
    req.on('timeout', () => req.destroy());
    req.end();
  } catch (e) {}
}

// Keep Render cloud instance awake 24/7 with a lightweight ping every 2 minutes
setInterval(() => {
  if (process.env.RENDER || process.env.PORT === '10000') return;
  try {
    https.get(`${CLOUD_RENDER_URL}/api/health`, () => {}).on('error', () => {});
  } catch(e) {}
}, 120000);

// Helper: Processed UIDs
function getProcessedUIDs() {
  try {
    if (fs.existsSync(PROCESSED_UIDS_FILE)) {
      return JSON.parse(fs.readFileSync(PROCESSED_UIDS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function markUIDProcessed(uid, messageId = null) {
  const list = getProcessedUIDs();
  let changed = false;
  if (uid) {
    const uidStr = uid.toString();
    if (!list.includes(uidStr)) {
      list.push(uidStr);
      changed = true;
    }
  }
  if (messageId) {
    const msgIdStr = messageId.toString();
    if (!list.includes(msgIdStr)) {
      list.push(msgIdStr);
      changed = true;
    }
  }
  if (changed) {
    if (list.length > 1000) list.splice(0, list.length - 1000);
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

// ----------------- CALENDAR & SCHEDULING DATE ENGINE ----------------- //

// Helper: Formatted upcoming interview date string (Strictly business days in future)
function getFormattedInterviewDate(daysAhead = 3, fromDate = new Date()) {
  const d = new Date(fromDate);
  let added = 0;
  while (added < daysAhead) {
    d.setDate(d.getDate() + 1);
    // Skip Saturday (6) and Sunday (0)
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      added++;
    }
  }
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString('en-US', options);
}

// Helper: Formatted upcoming joining date string (Strictly after interview, aligned on a Monday)
function getFormattedJoiningDate(weeksAhead = 3, fromInterviewDateStr = null) {
  let baseDate = new Date();
  if (fromInterviewDateStr) {
    const parsed = new Date(fromInterviewDateStr);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
    }
  }
  const d = new Date(baseDate);
  d.setDate(d.getDate() + (weeksAhead * 7));
  
  // Align to Monday (standard cohort onboarding)
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1);
  else if (day !== 1) d.setDate(d.getDate() + (8 - day));

  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString('en-US', options);
}

// Strict Date Validator & Sanitizer: Enforce that interview date is strictly in the future
function validateAndSanitizeInterviewDate(proposedDateStr, fromDate = new Date()) {
  const futureCalculated = getFormattedInterviewDate(3, fromDate);
  if (!proposedDateStr || typeof proposedDateStr !== 'string') {
    return futureCalculated;
  }
  
  const parsed = new Date(proposedDateStr);
  const today = new Date(fromDate);
  today.setHours(0, 0, 0, 0);

  // If unparseable or date is in the past (e.g. 2024 or 2025), return verified future date
  if (isNaN(parsed.getTime()) || parsed < today) {
    return futureCalculated;
  }

  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return parsed.toLocaleDateString('en-US', options);
}

// Helper: Sanitize email body from any hallucinated past dates
function sanitizeEmailBodyDates(bodyText, validInterviewDateStr) {
  if (!bodyText) return '';
  let sanitized = bodyText;
  // Replace legacy years (2020-2025) or past date formats with the valid interview date
  sanitized = sanitized.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+202[0-5]\b/gi, validInterviewDateStr);
  sanitized = sanitized.replace(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+202[0-5]\b/gi, validInterviewDateStr);
  sanitized = sanitized.replace(/\b202[0-5]-\d{2}-\d{2}\b/g, validInterviewDateStr);
  return sanitized;
}

// Multi-Model Gemini Evaluator with Automatic Retry & Failover
async function callGeminiEvaluation({ candidateName, candidateEmail, appliedRole, resumeText, emailBody, fileName }) {
  const { instructions: roleInstructions, activeRoles, roleNames } = buildRolePromptInstructions();

  const nowObj = new Date();
  const todayDateStr = nowObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const currentYear = nowObj.getFullYear();
  const defaultInterviewDate = getFormattedInterviewDate(3, nowObj);
  const defaultJoiningDate = getFormattedJoiningDate(3, defaultInterviewDate);

  const systemInstruction = `
You are an expert Senior Technical Recruiter & Hiring Director for ${appConfig.hrEmail} at ${appConfig.companyName}.
Carefully analyze the candidate's resume content, skills, experience, and application details.

${roleInstructions}

Candidate Target / Preferred Hint: "${appliedRole || 'Auto-Detect Best Active Open Role'}"

⏰ REAL-TIME CALENDAR & SCHEDULING CONTEXT (STRICT ENFORCEMENT):
1. TODAY'S APPLICATION DATE: Exactly "${todayDateStr}" (Current Year: ${currentYear}).
2. The candidate is submitting their application TODAY (${todayDateStr}).
3. PROPOSED INTERVIEW DATE: Must be scheduled strictly in the FUTURE. Set "proposedInterviewDate" to EXACTLY: "${defaultInterviewDate}".
4. ESTIMATED JOINING DATE: Must be scheduled approximately 3 weeks after the interview. Set to: "${defaultJoiningDate}".
5. STRICTLY PROHIBITED: NEVER generate or mention dates in past years (such as 2024 or 2025). Any reference to interview schedule or candidate application must reference ${currentYear} and the proposed date "${defaultInterviewDate}".
6. In "emailBody", if decision is SELECTED, invite them specifically for "${defaultInterviewDate} at 2:30 PM - 3:15 PM IST".

RETURN STRICT JSON ONLY (no markdown formatting, no code fences):
{
  "candidateName": "Extracted Full Name",
  "candidateEmail": "${candidateEmail || 'Extracted Email'}",
  "candidatePhone": "Extracted Phone or N/A",
  "appliedRole": "Exact matched active role from [${roleNames}]",
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
  "proposedInterviewDate": "${defaultInterviewDate}",
  "emailSubject": "Personalized subject line for candidate",
  "emailBody": "Personalized, warm and professional email message text (invitation for ${defaultInterviewDate} if SELECTED, polite constructive rejection if REJECTED)"
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

  const modelsToTry = appConfig.models || ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.6-flash'];

  for (const model of modelsToTry) {
    try {
      console.log(`🤖 Evaluating candidate with AI Engine (${model})...`);
      const evaluation = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${model}:generateContent?key=${appConfig.geminiApiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 15000
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
      console.warn(`⚠️ [${model}] ${err.message}. Trying next fallback model...`);
    }
  }

  throw new Error("All AI models failed or experienced high demand.");
}

// Helper: Generate persistent, clean Google Meet URL
function generateGoogleMeetLink(seed = '') {
  const chars = (seed ? seed.toString().toLowerCase().replace(/[^a-z0-9]/g, '') : '') + Math.random().toString(36).substring(2, 11);
  const clean = chars.padEnd(10, 'x').substring(0, 10);
  return `https://meet.google.com/${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 10)}`;
}

// HTML Email Template: Professional Interview Invitation with Google Meet Button
function generateInterviewInviteTemplate({ candidate }) {
  const candidateName = candidate.name || 'Candidate';
  const role = candidate.role || 'Full Stack Developer';
  const interviewDate = candidate.proposedInterviewDate || candidate.interviewDate || getFormattedInterviewDate(3);
  const interviewTime = candidate.interviewTime || '2:30 PM - 3:15 PM IST (45 Minutes)';
  const meetingLink = candidate.meetingLink || generateGoogleMeetLink(candidate.id || candidate.name);
  const interviewRound = candidate.interviewRound || (role === 'Digital Marketing Specialist' ? 'Round 1: Marketing Strategy & Campaign Review' : 'Round 1: Technical & System Architecture Deep-Dive');
  const interviewer = candidate.interviewerName || `${appConfig.companyName} Technical Hiring Panel`;

  const questionsList = (candidate.interviewQuestions || []).slice(0, 4).map(q => `<li style="margin-bottom: 8px; color: #475569;">${q}</li>`).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interview Invitation - ${appConfig.companyName}</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 30px 10px;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
            
            <!-- HEADER -->
            <tr>
              <td style="padding: 36px 32px 30px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); text-align: center; color: #ffffff;">
                <span style="display: inline-block; padding: 6px 14px; background: rgba(255,255,255,0.2); border-radius: 50px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">Interview Invitation</span>
                <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${appConfig.companyName}</h1>
                <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.9;">Target Position: <strong>${role}</strong></p>
              </td>
            </tr>

            <!-- BODY CONTENT -->
            <tr>
              <td style="padding: 32px;">
                <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">
                  Dear <strong>${candidateName}</strong>,
                </p>
                <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                  Thank you for applying for the <strong>${role}</strong> position at ${appConfig.companyName}. We have reviewed your credentials, and our hiring team is pleased to invite you for a virtual interview session.
                </p>

                <!-- INTERVIEW DETAILS CARD -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px; margin: 26px 0;">
                  <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 16px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                    📅 Schedule & Meeting Details
                  </h3>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b; width: 120px;"><strong>Date:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${interviewDate}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Time:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${interviewTime}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Format:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a;">${interviewRound}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Platform:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a;">Google Meet (Video Conference)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Interviewer:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a;">${interviewer}</td>
                    </tr>
                  </table>

                  <!-- JOIN BUTTON -->
                  <div style="text-align: center; margin-top: 22px;">
                    <a href="${meetingLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 13px 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
                      🎥 Join Google Meet Interview
                    </a>
                    <div style="margin-top: 10px;">
                      <a href="${meetingLink}" style="font-size: 12px; color: #6366f1; text-decoration: underline; word-break: break-all;">${meetingLink}</a>
                    </div>
                  </div>
                </div>

                ${questionsList ? `
                <!-- TOPICS / AGENDA -->
                <div style="margin: 24px 0;">
                  <h4 style="font-size: 14px; color: #334155; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Topics & Discussion Areas:</h4>
                  <ul style="padding-left: 20px; margin: 0; font-size: 14px; line-height: 1.6;">
                    ${questionsList}
                  </ul>
                </div>
                ` : ''}

                <p style="font-size: 14px; line-height: 1.6; color: #64748b;">
                  💡 <strong>Preparation Tips:</strong> Please ensure your camera and microphone are tested prior to the call and join the meeting link 2-3 minutes early.
                </p>

                <p style="font-size: 14px; line-height: 1.6; color: #64748b;">
                  If you need to request an alternative time slot or have any questions, simply reply directly to this email at <a href="mailto:${appConfig.hrEmail}" style="color: #4f46e5; text-decoration: none;">${appConfig.hrEmail}</a>.
                </p>

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px;">

                <!-- SIGNATURE -->
                <p style="font-size: 14px; color: #334155; margin: 0; line-height: 1.5;">
                  Warm regards,<br>
                  <strong>Recruitment & Talent Acquisition Team</strong><br>
                  ${appConfig.companyName}<br>
                  <span style="color: #64748b; font-size: 13px;">Direct Contact: ${appConfig.hrEmail}</span>
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding: 20px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
                © ${new Date().getFullYear()} ${appConfig.companyName}. All rights reserved.<br>
                Dispatched automatically via Nexus HR Automation Platform.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

// HTML Email Template: Official Hiring & Offer Letter
function generateHiringOfferTemplate({ candidate, joiningDate, salaryOffer, workMode, workLocation, employmentType, department, customNotes }) {
  const candidateName = candidate.name || 'Candidate';
  const role = candidate.role || 'Full Stack Developer';
  const calculatedJoining = getFormattedJoiningDate(3, candidate.interviewDate || candidate.proposedInterviewDate);
  const startDate = (joiningDate && !joiningDate.includes('Within')) 
    ? joiningDate 
    : (candidate.joiningDate && !candidate.joiningDate.includes('Within') ? candidate.joiningDate : calculatedJoining);
  const compDetails = salaryOffer || candidate.salaryOffer || 'Competitive Market Rate (As finalized during interview)';
  const workModeVal = workMode || candidate.workMode || 'Hybrid (3 Days Office / 2 Days Remote)';
  const workLocationVal = workLocation || candidate.workLocation || `${appConfig.companyName} Campus, Cyber City, Bangalore`;
  const empType = employmentType || candidate.employmentType || 'Full-Time Permanent';
  const dept = department || candidate.department || (role.toLowerCase().includes('marketing') ? 'Growth & Digital Marketing' : 'Core Engineering & Technology');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Official Job Offer - ${appConfig.companyName}</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 30px 10px;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
            
            <!-- HEADER -->
            <tr>
              <td style="padding: 36px 32px 30px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); text-align: center; color: #ffffff;">
                <span style="display: inline-block; padding: 6px 14px; background: rgba(255,255,255,0.25); border-radius: 50px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">🎉 Congratulations!</span>
                <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Official Job Offer</h1>
                <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.95;">Welcome to <strong>${appConfig.companyName}</strong></p>
              </td>
            </tr>

            <!-- BODY CONTENT -->
            <tr>
              <td style="padding: 32px;">
                <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">
                  Dear <strong>${candidateName}</strong>,
                </p>
                <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                  On behalf of <strong>${appConfig.companyName}</strong>, we are thrilled to extend to you a formal offer of employment for the position of <strong>${role}</strong>!
                </p>
                <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                  Our evaluation team was exceptionally impressed by your background, domain proficiency, and problem-solving approach during the recruitment rounds. We believe you will make a significant impact on our products and team culture.
                </p>

                <!-- OFFER DETAILS CARD -->
                <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 22px; margin: 26px 0;">
                  <h3 style="margin-top: 0; margin-bottom: 14px; font-size: 16px; color: #065f46; border-bottom: 1px solid #a7f3d0; padding-bottom: 8px;">
                    📋 Official Offer Summary & Terms
                  </h3>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857; width: 140px;"><strong>Offered Role:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b; font-weight: 700;">${role}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Organization:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b; font-weight: 600;">${appConfig.companyName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Department / Team:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b;">${dept}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Work Mode:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b; font-weight: 600;">🏢 ${workModeVal}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Work Location:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b;">📍 ${workLocationVal}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Employment Type:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b;">${empType}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Target Start Date:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b; font-weight: 700;">📅 ${startDate}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Compensation:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b; font-weight: 700;">💰 ${compDetails}</td>
                    </tr>
                  </table>
                </div>

                ${customNotes ? `
                <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 14px 18px; margin-bottom: 24px; border-radius: 4px;">
                  <strong style="color: #334155; font-size: 13px; text-transform: uppercase;">Note from Hiring Manager:</strong>
                  <p style="margin: 6px 0 0; font-size: 14px; color: #475569; line-height: 1.5;">${customNotes}</p>
                </div>
                ` : ''}

                <!-- NEXT STEPS INSTRUCTIONS -->
                <h4 style="font-size: 15px; color: #1e293b; margin-top: 24px; margin-bottom: 10px;">👉 What Happens Next:</h4>
                <ol style="padding-left: 20px; margin: 0 0 24px; font-size: 14px; color: #475569; line-height: 1.6;">
                  <li><strong>Acceptance Confirmation:</strong> Please reply directly to this email to confirm your acceptance of this offer.</li>
                  <li><strong>Documentation & Onboarding:</strong> Our HR department will issue your official appointment agreement and onboarding paperwork.</li>
                  <li><strong>Equipment & Workspace Setup:</strong> We will coordinate software access, credentials, and welcome briefing before your first day.</li>
                </ol>

                <!-- ACCEPTANCE CTA -->
                <div style="text-align: center; margin: 30px 0 10px;">
                  <a href="mailto:${appConfig.hrEmail}?subject=Acceptance%20of%20Offer%20-%20${encodeURIComponent(role)}%20-%20${encodeURIComponent(candidateName)}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 34px; border-radius: 8px; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.3);">
                    ✉️ Reply to Confirm Acceptance
                  </a>
                </div>

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px;">

                <!-- SIGNATURE -->
                <p style="font-size: 14px; color: #334155; margin: 0; line-height: 1.5;">
                  With warm congratulations and best regards,<br>
                  <strong>Manasvi Paliwal</strong><br>
                  Hiring Director & Talent Acquisition<br>
                  <strong>${appConfig.companyName}</strong><br>
                  <span style="color: #64748b; font-size: 13px;">Email: ${appConfig.hrEmail}</span>
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding: 20px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
                © ${new Date().getFullYear()} ${appConfig.companyName}. All rights reserved.<br>
                Official Employment Offer Document • Confidential
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

// Nodemailer custom HTML helper
async function sendCandidateCustomEmail(toEmail, subject, htmlContent, textFallback = '') {
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
    text: textFallback || "Please view this email in an HTML-compatible client.",
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ [Live Custom Email Sent] ID: ${info.messageId} to ${toEmail} (${subject})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ [Custom Email Dispatch Error]:", err.message);
    return { success: false, error: err.message };
  }
}

// Default Nodemailer helper
async function sendCandidateEmail(toEmail, subject, bodyText) {
  return sendCandidateCustomEmail(toEmail, subject, `
    <div style="font-family: Arial, sans-serif; max-width: 620px; line-height: 1.6; color: #333; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
      <h3 style="color: #6366f1; margin-top: 0;">${appConfig.companyName} — Application Status</h3>
      <p style="white-space: pre-line;">${bodyText}</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="font-size: 12px; color: #64748b;">
        Processed and dispatched automatically by our HR Automation System.<br>
        Recruiter Inbox: <strong>${appConfig.hrEmail}</strong>
      </p>
    </div>
  `, bodyText);
}

// ----------------- SERVER-SENT EVENTS (SSE) FOR INSTANT DASHBOARD UPDATES ----------------- //
let sseClients = [];

function broadcastSSE(event, data) {
  const payload = JSON.stringify(data);
  const msg = `event: ${event}\ndata: ${payload}\n\n`;
  
  sseClients = sseClients.filter(client => {
    try {
      client.res.write(msg);
      if (typeof client.res.flush === 'function') client.res.flush();
      return true;
    } catch (err) {
      return false;
    }
  });
}

// Keep-alive heartbeat ping every 15s so browser EventSource connections never drop
setInterval(() => {
  sseClients = sseClients.filter(client => {
    try {
      client.res.write(': keep-alive ping\n\n');
      if (typeof client.res.flush === 'function') client.res.flush();
      return true;
    } catch (err) {
      return false;
    }
  });
}, 15000);

app.get('/api/live-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  sseClients.push({ id: clientId, res });

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString() })}\n\n`);

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
  'aspireforher.com',
  'digest.groww.in',
  'googleplay-noreply@google.com',
  'google.com'
];

function shouldIgnoreSender(fromAddr) {
  if (!fromAddr) return true;
  const lower = fromAddr.toLowerCase();
  return IGNORE_DOMAINS.some(domain => lower.includes(domain));
}

// Process a candidate email application
async function processCandidateEmailRecord(parsed, uid) {
  const fromAddr = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].address : '';
  const fromName = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].name || fromAddr : fromAddr;
  const subject = parsed.subject || 'Job Application';
  const textBody = parsed.text || '';
  const attachments = parsed.attachments || [];
  const messageId = parsed.messageId || '';

  // Filter ignore rules for non-candidate marketing/newsletters
  if (shouldIgnoreSender(fromAddr)) {
    markUIDProcessed(uid, messageId);
    return false;
  }

  // Check attachments for resumes
  let hasResumeAttachment = false;
  let resumeAttachment = attachments.find(att => {
    const ext = path.extname(att.filename || '').toLowerCase();
    return ext === '.pdf' || ext === '.docx' || ext === '.doc';
  });

  let fileName = 'Direct Application (Email Body)';
  let resumeText = textBody;

  if (resumeAttachment) {
    hasResumeAttachment = true;
    fileName = resumeAttachment.filename || 'resume.pdf';
    const uploadPath = path.join(UPLOAD_DIR, fileName);
    fs.writeFileSync(uploadPath, resumeAttachment.content);

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
  }

  const subjLower = subject.toLowerCase();
  const bodyLower = textBody.toLowerCase();
  const isJobKeywords = subjLower.includes('job') || 
                       subjLower.includes('application') || 
                       subjLower.includes('resume') || 
                       subjLower.includes('cv') || 
                       subjLower.includes('engineer') || 
                       subjLower.includes('developer') || 
                       subjLower.includes('marketing') ||
                       subjLower.includes('apply') ||
                       subjLower.includes('candidate') ||
                       bodyLower.includes('resume') ||
                       bodyLower.includes('position') ||
                       bodyLower.includes('applying for');

  // Skip emails that are neither attachments nor job-related
  if (!hasResumeAttachment && !isJobKeywords) {
    markUIDProcessed(uid, messageId);
    return false;
  }

  console.log(`\n===============================================================`);
  console.log(`🎯 [INBOX AUTO-SCANNER] NEW CANDIDATE APPLICATION DETECTED!`);
  console.log(`   From:        ${fromName} <${fromAddr}>`);
  console.log(`   Subject:     ${subject}`);
  console.log(`   Attachment:  ${fileName} (${hasResumeAttachment ? 'Found' : 'Direct Email Text'})`);
  console.log(`   Text Length: ${resumeText.length} characters`);

  // Dynamically Infer Target Role from currently active openings
  const activeRoles = getActiveJobRoles();
  let appliedRole = activeRoles[0] ? activeRoles[0].title : 'Full Stack Developer';
  const combined = (subject + ' ' + textBody + ' ' + resumeText).toLowerCase();
  let highestMatchCount = -1;

  for (const r of activeRoles) {
    let count = 0;
    const titleWords = r.title.toLowerCase().split(' ').filter(w => w.length > 2);
    titleWords.forEach(tw => { if (combined.includes(tw)) count += 3; });
    (r.requiredSkills || []).forEach(sk => { if (combined.includes(sk.toLowerCase())) count += 1; });
    if (count > highestMatchCount) {
      highestMatchCount = count;
      appliedRole = r.title;
    }
  }

  // Call Gemini Evaluation with dynamic active roles
  const evaluation = await callGeminiEvaluation({
    candidateName: fromName,
    candidateEmail: fromAddr,
    appliedRole,
    resumeText,
    emailBody: textBody,
    fileName
  });

  console.log(`   🎯 Decision: ${evaluation.candidateName} -> ${evaluation.decision} (${evaluation.matchScore}%) for Role: ${evaluation.appliedRole || appliedRole}`);

  const primarySenderEmail = fromAddr || evaluation.candidateEmail || 'candidate@example.com';
  const resumeExtractedEmail = evaluation.candidateEmail || fromAddr || 'N/A';
  const now = new Date().toISOString();
  const candId = 'cand_auto_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const meetingLink = generateGoogleMeetLink(candId);
  const matchedRole = evaluation.appliedRole || appliedRole;

  // Calculate verified, future-guaranteed interview & joining dates
  const interviewDate = validateAndSanitizeInterviewDate(evaluation.proposedInterviewDate, new Date());
  const joiningDate = getFormattedJoiningDate(3, interviewDate);
  const interviewTime = '2:30 PM - 3:15 PM IST (45 Minutes)';
  const interviewRound = (matchedRole.toLowerCase().includes('marketing'))
    ? 'Round 1: Marketing Strategy & Portfolio Review'
    : 'Round 1: Technical & System Architecture Deep-Dive';
  const interviewerName = `${appConfig.companyName} Technical Hiring Panel`;

  const cleanEmailBody = sanitizeEmailBodyDates(evaluation.emailBody, interviewDate);

  const candidateRecord = {
    id: candId,
    name: evaluation.candidateName || fromName,
    email: primarySenderEmail,
    resumeEmail: resumeExtractedEmail,
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
    proposedInterviewDate: interviewDate,
    interviewDate: interviewDate,
    interviewTime: interviewTime,
    joiningDate: joiningDate,
    interviewRound: interviewRound,
    meetingLink: meetingLink,
    interviewerName: interviewerName,
    workMode: 'Hybrid (3 Days Office / 2 Days Remote)',
    workLocation: `${appConfig.companyName} Campus, Cyber City, Bangalore`,
    employmentType: 'Full-Time Permanent',
    department: (evaluation.appliedRole || appliedRole).toLowerCase().includes('marketing') ? 'Growth & Digital Marketing' : 'Core Engineering & Technology',
    location: 'Bangalore, India / Open to Relocation',
    salaryOffer: 'Competitive / Market Standard (Finalized upon Offer)',
    interviewStatus: evaluation.decision === 'SELECTED' ? `Interview Scheduled (${interviewDate})` : 'N/A',
    emailSubject: evaluation.decision === 'SELECTED' 
      ? `📅 Interview Invitation: ${evaluation.appliedRole || appliedRole} at ${appConfig.companyName}` 
      : (evaluation.emailSubject || `Application Update: ${evaluation.appliedRole || appliedRole}`),
    emailBody: cleanEmailBody,
    emailSentAt: now,
    createdAt: now,
    updatedAt: now,
    source: `Gmail IMAP (${fileName})`
  };

  // Dispatch Email to applicant sender automatically
  if (appConfig.autoSendEmails && primarySenderEmail && primarySenderEmail.includes('@')) {
    console.log(`   ✉️ [Auto-Dispatch] Sending ${evaluation.decision} email response to ${primarySenderEmail}...`);
    let dispatchResult = null;
    if (evaluation.decision === 'SELECTED') {
      const inviteHtml = generateInterviewInviteTemplate({ candidate: candidateRecord });
      dispatchResult = await sendCandidateCustomEmail(primarySenderEmail, candidateRecord.emailSubject, inviteHtml, cleanEmailBody);
    } else {
      dispatchResult = await sendCandidateEmail(primarySenderEmail, candidateRecord.emailSubject, cleanEmailBody);
    }

    if (dispatchResult && dispatchResult.success) {
      console.log(`   ✅ [Auto-Dispatch SUCCESS] Message ID: ${dispatchResult.messageId} delivered to ${primarySenderEmail}`);
      candidateRecord.emailMessageId = dispatchResult.messageId;
      candidateRecord.emailSentAt = new Date().toISOString();
    } else {
      console.error(`   ⚠️ [Auto-Dispatch Notice]:`, dispatchResult ? dispatchResult.error : 'Dispatch failure');
    }
  }

  // Save Candidate with clean deduplication
  let candidates = getCandidates();
  candidates = candidates.filter(c => 
    c.id !== candidateRecord.id && 
    !(c.email && candidateRecord.email && c.email.toLowerCase() === candidateRecord.email.toLowerCase() && c.role === candidateRecord.role) &&
    !(c.name && candidateRecord.name && c.name.toLowerCase() === candidateRecord.name.toLowerCase() && c.role === candidateRecord.role)
  );
  candidates.unshift(candidateRecord);
  saveCandidates(candidates);
  markUIDProcessed(uid, messageId);

  scannerStats.resumesProcessed++;
  scannerStats.lastCandidateName = candidateRecord.name;

  // Broadcast Real-Time SSE to Dashboard with full payload
  broadcastSSE('candidate_added', {
    candidate: candidateRecord,
    total: candidates.length,
    candidates: candidates
  });

  // ☁️ Immediately forward evaluated candidate to Render.com cloud instance
  syncCandidateToCloud(candidateRecord);

  console.log(`   ✅ Candidate broadcasted to Live Dashboard & Synced to Cloud! Total: ${candidates.length}`);
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
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 15000,
    connTimeout: 20000
  });

  const cleanup = () => {
    isScanInProgress = false;
    try { imap.end(); } catch (e) {}
  };

  imap.once('ready', () => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        cleanup();
        return;
      }

      scannerStats.lastScanTime = new Date().toISOString();
      scannerStats.totalScans++;

      const total = box.messages.total;
      if (total === 0) {
        cleanup();
        return;
      }

      const processedUIDs = getProcessedUIDs();
      const startSeq = Math.max(1, total - 14);
      const endSeq = total;

      // STEP 1: Fast header fetch in < 1 second
      const f = imap.seq.fetch(`${startSeq}:${endSeq}`, {
        bodies: 'HEADER.FIELDS (MESSAGE-ID FROM SUBJECT DATE)',
        struct: true
      });

      const candidateSeqsToFetch = [];

      f.on('message', (msg, seqno) => {
        let headerBuffer = '';
        let uid = seqno.toString();

        msg.on('attributes', (attrs) => {
          if (attrs && attrs.uid) uid = attrs.uid.toString();
        });

        msg.on('body', (stream) => {
          stream.on('data', chunk => headerBuffer += chunk.toString('utf8'));
        });

        msg.once('end', () => {
          const fromMatch = headerBuffer.match(/From:\s*([^\r\n]+)/i);
          const msgIdMatch = headerBuffer.match(/Message-ID:\s*<([^>]+)>/i);
          const subjMatch = headerBuffer.match(/Subject:\s*([^\r\n]+)/i);

          const fromStr = fromMatch ? fromMatch[1].toLowerCase() : '';
          const msgId = msgIdMatch ? msgIdMatch[1] : '';
          const subjStr = subjMatch ? subjMatch[1].toLowerCase() : '';

          if (fromStr && shouldIgnoreSender(fromStr)) {
            markUIDProcessed(uid, msgId);
            return;
          }

          if (processedUIDs.includes(uid) || (msgId && processedUIDs.includes(msgId))) {
            return;
          }

          candidateSeqsToFetch.push({ seqno, uid, msgId });
        });
      });

      f.once('error', (err) => {
        console.error('Header fetch error:', err.message);
        cleanup();
      });

      f.once('end', async () => {
        if (candidateSeqsToFetch.length === 0) {
          cleanup();
          return;
        }

        console.log(`🔍 [INBOX Scanner] Found ${candidateSeqsToFetch.length} new unprocessed message(s). Fetching details...`);

        // STEP 2: Fetch and process each candidate message sequentially
        for (const item of candidateSeqsToFetch) {
          markUIDProcessed(item.uid, item.msgId);
          try {
            await new Promise((resolve) => {
              const fullFetch = imap.seq.fetch(`${item.seqno}:${item.seqno}`, { bodies: '', struct: true });
              let fullBuffer = '';

              fullFetch.on('message', (m) => {
                m.on('body', (s) => {
                  s.on('data', c => fullBuffer += c.toString('utf8'));
                });
              });

              fullFetch.once('error', () => resolve());
              fullFetch.once('end', async () => {
                if (fullBuffer) {
                  try {
                    const parsed = await simpleParser(fullBuffer);
                    await processCandidateEmailRecord(parsed, item.uid);
                  } catch (pErr) {
                    console.error('Candidate processing error:', pErr.message);
                  }
                }
                resolve();
              });
            });
          } catch (itemErr) {
            console.error('Message fetch error:', itemErr.message);
          }
        }

        cleanup();
      });
    });
  });

  imap.once('error', (err) => {
    console.error('IMAP connection error:', err.message);
    cleanup();
  });

  imap.once('close', () => {
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
      interviewDate: candidateData.interviewDate || candidateData.proposedInterviewDate || null,
      interviewTime: candidateData.interviewTime || '02:00 PM IST (45 Minutes)',
      meetingLink: candidateData.meetingLink || 'https://meet.google.com/tech-hr-interview',
      interviewRound: candidateData.interviewRound || 'Technical & System Design Round',
      interviewerName: candidateData.interviewerName || 'Engineering Hiring Panel',
      interviewStatus: candidateData.interviewStatus || (candidateData.decision === 'SELECTED' ? 'Interview Scheduled' : 'N/A'),
      joiningDate: candidateData.joiningDate || null,
      salaryOffer: candidateData.salaryOffer || null,
      workMode: candidateData.workMode || 'Hybrid (3 Days Office / 2 Days Remote)',
      workLocation: candidateData.workLocation || 'Tech Innovations Campus, Cyber City, Bangalore',
      employmentType: candidateData.employmentType || 'Full-Time Permanent',
      department: candidateData.department || 'Core Engineering & Technology',
      hrNotes: candidateData.hrNotes || null,
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

    broadcastSSE('candidate_added', { candidate: candidateRecord, total: candidates.length, candidates });
    syncCandidateToCloud(candidateRecord);

    res.json({ success: true, count: candidates.length, candidates: candidates, candidate: candidateRecord });
  } catch (err) {
    console.error("Save candidate error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4c. Bulk sync entire candidates array (Used for local <-> Render cloud synchronization)
app.post('/api/candidates/sync-bulk', (req, res) => {
  try {
    const { candidates: incomingList } = req.body;
    if (!Array.isArray(incomingList)) {
      return res.status(400).json({ success: false, error: 'candidates must be an array' });
    }
    let currentList = getCandidates();
    let addedCount = 0;
    
    incomingList.forEach(cand => {
      const idx = currentList.findIndex(c => 
        c.id === cand.id || 
        (c.email && cand.email && c.email.toLowerCase() === cand.email.toLowerCase() && c.role === cand.role) ||
        (c.name && cand.name && c.name.toLowerCase() === cand.name.toLowerCase() && c.role === cand.role)
      );
      if (idx >= 0) {
        currentList[idx] = { ...currentList[idx], ...cand };
      } else {
        currentList.unshift(cand);
        addedCount++;
      }
    });

    saveCandidates(currentList);
    broadcastSSE('candidate_added', { total: currentList.length, candidates: currentList });
    res.json({ success: true, count: currentList.length, addedCount, message: `Synced ${incomingList.length} candidates` });
  } catch (err) {
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
    const candId = 'cand_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const meetingLink = generateGoogleMeetLink(candId);
    const targetRole = appliedRole || evaluation.appliedRole || 'Full Stack Developer';

    // Calculate verified, future-guaranteed interview & joining dates
    const interviewDate = validateAndSanitizeInterviewDate(evaluation.proposedInterviewDate, new Date());
    const joiningDate = getFormattedJoiningDate(3, interviewDate);
    const interviewTime = '2:30 PM - 3:15 PM IST (45 Minutes)';
    const interviewRound = (targetRole === 'Digital Marketing Specialist')
      ? 'Round 1: Marketing Strategy & Campaign Review'
      : 'Round 1: Technical & System Architecture Deep-Dive';
    const interviewerName = `${appConfig.companyName} Technical Hiring Panel`;

    const cleanEmailBody = sanitizeEmailBodyDates(evaluation.emailBody, interviewDate);

    const candidateRecord = {
      id: candId,
      name: evaluation.candidateName || candidateName || 'Candidate',
      email: candidateEmail || evaluation.candidateEmail || 'N/A',
      phone: evaluation.candidatePhone || 'N/A',
      role: targetRole,
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
      proposedInterviewDate: interviewDate,
      interviewDate: interviewDate,
      interviewTime: interviewTime,
      joiningDate: joiningDate,
      interviewRound: interviewRound,
      meetingLink: meetingLink,
      interviewerName: interviewerName,
      workMode: 'Hybrid (3 Days Office / 2 Days Remote)',
      workLocation: `${appConfig.companyName} Campus, Cyber City, Bangalore`,
      employmentType: 'Full-Time Permanent',
      department: targetRole.toLowerCase().includes('marketing') ? 'Growth & Digital Marketing' : 'Core Engineering & Technology',
      location: 'Bangalore, India / Open to Relocation',
      salaryOffer: 'Competitive / Market Standard (Finalized upon Offer)',
      interviewStatus: evaluation.decision === 'SELECTED' ? `Interview Scheduled (${interviewDate})` : 'N/A',
      emailSubject: evaluation.decision === 'SELECTED' 
        ? `📅 Interview Invitation: ${targetRole} at ${appConfig.companyName}` 
        : (evaluation.emailSubject || `Application Update: ${targetRole}`),
      emailBody: cleanEmailBody,
      emailSentAt: now,
      createdAt: now,
      updatedAt: now,
      source: fileName === 'Direct Submission' ? 'Dashboard Submission' : `File Upload (${fileName})`
    };

    if (candidateEmail && candidateEmail.includes('@') && appConfig.autoSendEmails) {
      if (evaluation.decision === 'SELECTED') {
        const inviteHtml = generateInterviewInviteTemplate({ candidate: candidateRecord });
        await sendCandidateCustomEmail(candidateEmail, candidateRecord.emailSubject, inviteHtml, cleanEmailBody);
      } else {
        await sendCandidateEmail(candidateEmail, candidateRecord.emailSubject, cleanEmailBody);
      }
    }

    let candidates = getCandidates();
    candidates = candidates.filter(c => c.id !== candidateRecord.id && !(c.name === candidateRecord.name && c.role === candidateRecord.role));
    candidates.unshift(candidateRecord);
    saveCandidates(candidates);

    broadcastSSE('candidate_added', { candidate: candidateRecord, total: candidates.length, candidates });
    syncCandidateToCloud(candidateRecord);

    res.json({ success: true, candidate: candidateRecord, evaluation });
  } catch (err) {
    console.error("Evaluation error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

app.post('/api/evaluate-resume', uploadFields, handleEvaluationRequest);
app.post('/api/evaluate', uploadFields, handleEvaluationRequest);

// 6. Update candidate status & full profile (Supports both PATCH and PUT)
async function handleCandidateStatusUpdate(req, res) {
  try {
    const {
      status,
      decision,
      name,
      email,
      phone,
      role,
      location,
      workMode,
      workLocation,
      employmentType,
      department,
      yearsOfExperience,
      education,
      matchScore,
      interviewDate,
      interviewTime,
      proposedInterviewDate,
      meetingLink,
      interviewerName,
      interviewRound,
      interviewStatus,
      hrNotes,
      joiningDate,
      salaryOffer,
      sendUpdateEmail,
      customEmailSubject,
      customEmailBody
    } = req.body;

    const list = getCandidates();
    const index = list.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, error: 'Candidate not found' });

    const prevStatus = list[index].status;
    const candidate = list[index];

    // Update fields
    if (name) candidate.name = name;
    if (email) candidate.email = email;
    if (phone !== undefined) candidate.phone = phone;
    if (location !== undefined) candidate.location = location;
    if (workMode !== undefined) candidate.workMode = workMode;
    if (workLocation !== undefined) candidate.workLocation = workLocation;
    if (employmentType !== undefined) candidate.employmentType = employmentType;
    if (department !== undefined) candidate.department = department;
    if (yearsOfExperience !== undefined) candidate.yearsOfExperience = yearsOfExperience;
    if (education !== undefined) candidate.education = education;
    if (role) candidate.role = role;
    if (status) candidate.status = status;
    if (decision) candidate.decision = decision;
    if (matchScore !== undefined) candidate.matchScore = Number(matchScore);
    
    // Resolve and validate interview date
    const resolvedInterviewDate = (interviewDate || proposedInterviewDate)
      ? validateAndSanitizeInterviewDate(interviewDate || proposedInterviewDate)
      : (candidate.interviewDate ? validateAndSanitizeInterviewDate(candidate.interviewDate) : getFormattedInterviewDate(3));
    candidate.proposedInterviewDate = resolvedInterviewDate;
    candidate.interviewDate = resolvedInterviewDate;

    // Resolve and validate joining date
    const resolvedJoiningDate = (joiningDate && !joiningDate.includes('Within'))
      ? joiningDate
      : (candidate.joiningDate && !candidate.joiningDate.includes('Within') ? candidate.joiningDate : getFormattedJoiningDate(3, resolvedInterviewDate));
    candidate.joiningDate = resolvedJoiningDate;

    if (interviewTime) candidate.interviewTime = interviewTime;
    if (meetingLink) candidate.meetingLink = meetingLink;
    if (interviewerName) candidate.interviewerName = interviewerName;
    if (interviewRound) candidate.interviewRound = interviewRound;
    if (interviewStatus) candidate.interviewStatus = interviewStatus;
    if (hrNotes !== undefined) candidate.hrNotes = hrNotes;
    if (salaryOffer !== undefined) candidate.salaryOffer = salaryOffer;

    candidate.updatedAt = new Date().toISOString();

    let emailSentResult = null;

    // 🎯 AUTOMATION 1: If marked as HIRED (or OFFER_EXTENDED), automatically dispatch formal Job Offer Email!
    if (status === 'HIRED' || (status === 'OFFER_EXTENDED' && prevStatus !== 'OFFER_EXTENDED') || (status === 'HIRED' && prevStatus !== 'HIRED')) {
      candidate.decision = 'SELECTED';
      candidate.interviewStatus = '🎉 Official Job Offer Dispatched';
      
      const offerSubject = customEmailSubject || `🎉 Congratulations! Job Offer for ${candidate.role} at ${appConfig.companyName}`;
      const offerHtml = generateHiringOfferTemplate({
        candidate,
        joiningDate: resolvedJoiningDate,
        salaryOffer: salaryOffer || candidate.salaryOffer || 'Competitive Market Rate (As finalized during interview)',
        workMode: workMode || candidate.workMode || 'Hybrid (3 Days Office / 2 Days Remote)',
        workLocation: workLocation || candidate.workLocation || `${appConfig.companyName} Campus, Cyber City, Bangalore`,
        employmentType: employmentType || candidate.employmentType || 'Full-Time Permanent',
        department: department || candidate.department || (candidate.role.toLowerCase().includes('marketing') ? 'Growth & Digital Marketing' : 'Core Engineering & Technology'),
        customNotes: hrNotes || ''
      });

      console.log(`🚀 [Auto-Hiring Dispatch] Candidate ${candidate.name} updated to ${status}. Sending offer email to ${candidate.email}...`);
      if (candidate.email && candidate.email.includes('@') && appConfig.autoSendEmails) {
        emailSentResult = await sendCandidateCustomEmail(candidate.email, offerSubject, offerHtml);
        if (emailSentResult.success) {
          candidate.emailSubject = offerSubject;
          candidate.emailSentAt = new Date().toISOString();
        }
      }
    } 
    // 🎯 AUTOMATION 2: If status updated to INTERVIEW_SCHEDULED and email requested
    else if (status === 'INTERVIEW_SCHEDULED' && (prevStatus !== 'INTERVIEW_SCHEDULED' || sendUpdateEmail)) {
      if (!candidate.meetingLink) {
        candidate.meetingLink = generateGoogleMeetLink(candidate.id || candidate.name);
      }
      const inviteSubject = customEmailSubject || `📅 Interview Scheduled: ${candidate.role} at ${appConfig.companyName}`;
      const inviteHtml = generateInterviewInviteTemplate({ candidate });

      console.log(`📅 [Auto-Interview Dispatch] Sending updated interview invitation to ${candidate.email}...`);
      if (candidate.email && candidate.email.includes('@') && appConfig.autoSendEmails) {
        emailSentResult = await sendCandidateCustomEmail(candidate.email, inviteSubject, inviteHtml);
        if (emailSentResult.success) {
          candidate.emailSubject = inviteSubject;
          candidate.emailSentAt = new Date().toISOString();
          candidate.interviewStatus = `Interview Invitation Dispatched (${candidate.meetingLink})`;
        }
      }
    } 
    // 🎯 AUTOMATION 3: Manual custom email dispatch if requested
    else if (sendUpdateEmail && customEmailSubject && customEmailBody && candidate.email && candidate.email.includes('@')) {
      emailSentResult = await sendCandidateEmail(candidate.email, customEmailSubject, customEmailBody);
      if (emailSentResult && emailSentResult.success) {
        candidate.emailSubject = customEmailSubject;
        candidate.emailSentAt = new Date().toISOString();
      }
    }

    saveCandidates(list);
    broadcastSSE('candidate_updated', { candidate, emailSent: emailSentResult });
    syncCandidateToCloud(candidate);

    res.json({
      success: true,
      candidate,
      emailSent: emailSentResult ? emailSentResult.success : false,
      message: status === 'HIRED'
        ? 'Candidate marked as HIRED and official Job Offer email dispatched automatically!'
        : 'Candidate details and pipeline status updated successfully.'
    });
  } catch (err) {
    console.error("Candidate status update error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

app.patch('/api/candidates/:id/status', handleCandidateStatusUpdate);
app.put('/api/candidates/:id/status', handleCandidateStatusUpdate);
app.put('/api/candidates/:id', handleCandidateStatusUpdate);

// 7. Delete candidate
app.delete('/api/candidates/:id', (req, res) => {
  try {
    let list = getCandidates();
    const candToDelete = list.find(c => c.id === req.params.id);
    list = list.filter(c => c.id !== req.params.id);
    saveCandidates(list);
    broadcastSSE('candidate_deleted', { id: req.params.id, candidateId: req.params.id, total: list.length, candidates: list });
    deleteCandidateOnCloud(req.params.id);
    res.json({ success: true, message: `Candidate ${candToDelete ? candToDelete.name : req.params.id} deleted successfully`, id: req.params.id, total: list.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

// 11. Settings & Config
app.get('/api/settings', (req, res) => {
  res.json({ success: true, config: appConfig });
});

app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    companyName: appConfig.companyName,
    hrEmail: appConfig.hrEmail,
    selectionScoreThreshold: appConfig.selectionScoreThreshold,
    autoSendEmails: appConfig.autoSendEmails,
    models: appConfig.models
  });
});

// 12. Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'Tech Innovations Inc. - Nexus HR Recruitment Pipeline',
    inboxWatcher: scannerStats.status,
    activeRolesCount: getActiveJobRoles().length
  });
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

// 12. Job Roles & Active Openings Management Endpoints
app.get('/api/job-roles', (req, res) => {
  const roles = getJobRoles();
  const activeRoles = getActiveJobRoles();
  res.json({
    success: true,
    roles,
    activeCount: activeRoles.length,
    activeRoleTitles: activeRoles.map(r => r.title)
  });
});

app.put('/api/job-roles/active', (req, res) => {
  try {
    const { activeRoleIds } = req.body;
    if (!Array.isArray(activeRoleIds)) {
      return res.status(400).json({ success: false, error: "activeRoleIds must be an array of role IDs" });
    }
    const roles = getJobRoles();
    roles.forEach(r => {
      r.isActive = activeRoleIds.includes(r.id);
    });
    saveJobRoles(roles);
    
    const active = roles.filter(r => r.isActive);
    broadcastSSE('job_roles_updated', { roles, activeCount: active.length });
    
    res.json({
      success: true,
      message: `Active hiring openings updated (${active.length} active roles)`,
      roles,
      activeRoles: active
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/job-roles', (req, res) => {
  try {
    const { title, department, requiredSkills, minExperience, description, isActive } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Role title is required" });
    }
    const roles = getJobRoles();
    const newId = 'role_custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    
    const newRole = {
      id: newId,
      title: title.trim(),
      department: department ? department.trim() : 'General',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : (requiredSkills ? requiredSkills.split(',').map(s => s.trim()).filter(Boolean) : []),
      minExperience: minExperience ? minExperience.trim() : '1+ Years',
      description: description ? description.trim() : ''
    };

    roles.push(newRole);
    saveJobRoles(roles);
    
    broadcastSSE('job_roles_updated', { roles });
    res.json({ success: true, message: `Role "${newRole.title}" created successfully`, role: newRole, roles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/job-roles/:id', (req, res) => {
  try {
    const { title, department, requiredSkills, minExperience, description, isActive } = req.body;
    const roles = getJobRoles();
    const index = roles.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, error: "Role not found" });

    if (title) roles[index].title = title.trim();
    if (department) roles[index].department = department.trim();
    if (requiredSkills !== undefined) {
      roles[index].requiredSkills = Array.isArray(requiredSkills) ? requiredSkills : (requiredSkills ? requiredSkills.split(',').map(s => s.trim()).filter(Boolean) : []);
    }
    if (minExperience) roles[index].minExperience = minExperience.trim();
    if (description) roles[index].description = description.trim();
    if (isActive !== undefined) roles[index].isActive = Boolean(isActive);

    saveJobRoles(roles);
    broadcastSSE('job_roles_updated', { roles });
    res.json({ success: true, message: "Role updated successfully", role: roles[index], roles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/job-roles/:id', (req, res) => {
  try {
    let roles = getJobRoles();
    const target = roles.find(r => r.id === req.params.id);
    if (!target) return res.status(404).json({ success: false, error: "Role not found" });

    roles = roles.filter(r => r.id !== req.params.id);
    saveJobRoles(roles);
    broadcastSSE('job_roles_updated', { roles });
    res.json({ success: true, message: `Role "${target.title}" removed successfully`, roles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

  // Initial Full Sync to Cloud
  setTimeout(syncAllCandidatesToCloud, 1500);

  // Run automated scan every 5 seconds continuously
  setInterval(scanInboxNow, 5000);
});
