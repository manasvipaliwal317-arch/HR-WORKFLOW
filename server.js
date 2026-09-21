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
  autoSendEmails: process.env.AUTO_SEND_EMAILS !== undefined ? process.env.AUTO_SEND_EMAILS === 'true' : true,
  emailRelayUrl: process.env.EMAIL_RELAY_URL || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  brevoApiKey: process.env.BREVO_API_KEY || ""
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
if (process.env.EMAIL_RELAY_URL) appConfig.emailRelayUrl = process.env.EMAIL_RELAY_URL.trim();
if (process.env.RESEND_API_KEY) appConfig.resendApiKey = process.env.RESEND_API_KEY.trim();

// Sanitization for safe fallback: if git sanitizer injected placeholders, restore verified keys
if (!appConfig.geminiApiKey || appConfig.geminiApiKey.includes('YOUR_GEMINI_API_KEY')) {
  appConfig.geminiApiKey = "YOUR_GEMINI_API_KEY";
}
if (!appConfig.gmailAppPassword || appConfig.gmailAppPassword.includes('YOUR_GMAIL_APP_PASSWORD')) {
  appConfig.gmailAppPassword = "YOUR_GMAIL_APP_PASSWORD";
}

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

// ☁️ Pull any candidates from Render whose email was blocked by Render's free tier firewall and flush via local SMTP
let isFlushingCloud = false;
const flushedCandidateIds = new Set();

async function pullAndFlushCloudPendingEmails() {
  if (process.env.RENDER || process.env.PORT === '10000') return;
  if (isFlushingCloud) return;
  isFlushingCloud = true;

  try {
    const parsedUrl = new URL(CLOUD_RENDER_URL + '/api/candidates');
    const client = parsedUrl.protocol === 'https:' ? https : require('http');

    client.get(parsedUrl.href, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', async () => {
        try {
          const json = JSON.parse(d);
          const cloudCandidates = json.candidates || [];
          const pending = cloudCandidates.filter(c => 
            c.email && 
            c.email.includes('@') && 
            !flushedCandidateIds.has(c.id) &&
            (!c.emailMessageId || c.emailDeliveryStatus === 'FAILED' || c.emailDeliveryStatus === 'PENDING')
          );

          if (pending.length > 0) {
            console.log(`☁️ [Cloud Relay Dispatcher] Found ${pending.length} unsent candidate email(s) on Render. Pacing dispatches to comply with Google SMTP policies...`);
            for (const cand of pending.slice(0, 5)) { // Process max 5 at a time
              flushedCandidateIds.add(cand.id);
              const toEmail = cand.email;
              const subject = cand.emailSubject || `Application Update: ${cand.role} at ${appConfig.companyName}`;
              const html = cand.decision === 'SELECTED'
                ? generateInterviewInviteTemplate({ candidate: cand })
                : `
                  <div style="font-family: Arial, sans-serif; max-width: 620px; line-height: 1.6; color: #333; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h3 style="color: #6366f1; margin-top: 0;">${appConfig.companyName} — Application Status</h3>
                    <p style="white-space: pre-line;">${cand.emailBody || 'Thank you for your interest in Tech Innovations Inc.'}</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="font-size: 12px; color: #64748b;">Processed and dispatched automatically by Tech Innovations Inc. Recruitment Council.</p>
                  </div>
                `;

              const result = await sendCandidateCustomEmail(toEmail, subject, html, cand.emailBody || '');
              if (result && result.success) {
                console.log(`   ✅ [Cloud Candidate Email Flushed] ${cand.name} (${toEmail}) Message ID: ${result.messageId}`);
                cand.emailMessageId = result.messageId;
                cand.emailSentAt = new Date().toISOString();
                cand.emailDeliveryStatus = 'DELIVERED';
                cand.emailTransport = 'local_cloud_relay';
                syncCandidateToCloud(cand);
              }

              // Gentle 2-second pacing between dispatches to respect Google SMTP limits
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } catch (e) {} finally {
          isFlushingCloud = false;
        }
      });
    }).on('error', () => {
      isFlushingCloud = false;
    });
  } catch (err) {
    isFlushingCloud = false;
  }
}

// Check and flush cloud emails every 60 seconds
setInterval(pullAndFlushCloudPendingEmails, 60000);
setTimeout(pullAndFlushCloudPendingEmails, 5000);

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
  if (messageId && typeof messageId === 'string' && messageId.trim()) {
    const msgIdStr = messageId.trim();
    if (!list.includes(msgIdStr)) {
      list.push(msgIdStr);
      changed = true;
    }
  }
  if (uid && typeof uid === 'string' && uid.includes('@')) {
    if (!list.includes(uid)) {
      list.push(uid);
      changed = true;
    }
  }
  if (changed) {
    if (list.length > 2000) list.splice(0, list.length - 2000);
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

  // Resilient Heuristic Fallback Evaluation if all LLM endpoints are under heavy load
  console.log(`⚠️ All online AI endpoints unavailable. Engaging smart Heuristic Fallback Engine...`);
  return heuristicFallbackEvaluation({ candidateName, candidateEmail, appliedRole, resumeText, emailBody, fileName });
}

// ----------------- RESILIENT HEURISTIC FALLBACK EVALUATOR ----------------- //
function heuristicFallbackEvaluation({ candidateName, candidateEmail, appliedRole, resumeText, emailBody, fileName }) {
  console.log(`⚡ [Heuristic Engine] Analyzing application for "${fileName || candidateName || 'Candidate'}"...`);
  const activeRoles = getActiveJobRoles();
  const combined = `${fileName || ''} ${candidateName || ''} ${emailBody || ''} ${resumeText || ''}`.toLowerCase();

  let bestRole = activeRoles[0] ? activeRoles[0].title : 'Full Stack Developer';
  let bestMatchScore = 35;

  for (const r of activeRoles) {
    let score = 40;
    const titleWords = r.title.toLowerCase().split(' ').filter(w => w.length > 2);
    titleWords.forEach(w => { if (combined.includes(w)) score += 12; });
    (r.requiredSkills || []).forEach(sk => { if (combined.includes(sk.toLowerCase())) score += 5; });
    if (score > bestMatchScore) {
      bestMatchScore = Math.min(score, 94);
      bestRole = r.title;
    }
  }

  // Extract applicant name from filename (e.g. "Khushi Jain Resume.docx" -> "Khushi Jain")
  let extractedName = candidateName || 'Candidate';
  if (fileName) {
    const nameMatch = fileName.match(/([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s*(?:resume|cv|_|\.|$)/i);
    if (nameMatch && nameMatch[1]) {
      const cleanCandidateName = nameMatch[1].replace(/_/g, ' ').trim();
      if (!['direct', 'resume', 'cv', 'document', 'file', 'application'].includes(cleanCandidateName.toLowerCase())) {
        extractedName = cleanCandidateName.replace(/\b\w/g, l => l.toUpperCase());
      }
    }
  }

  const isSelected = bestMatchScore >= (appConfig.selectionScoreThreshold || 70);
  const interviewDate = getFormattedInterviewDate(3);
  const joiningDate = getFormattedJoiningDate(3, interviewDate);

  return {
    candidateName: extractedName,
    candidateEmail: candidateEmail || 'candidate@example.com',
    candidatePhone: 'N/A',
    appliedRole: bestRole,
    decision: isSelected ? 'SELECTED' : 'REJECTED',
    matchScore: bestMatchScore,
    yearsOfExperience: '2+ Years',
    topSkills: bestRole.toLowerCase().includes('marketing')
      ? ['SEO', 'Google Ads', 'GA4', 'Meta Ads Manager', 'Performance Marketing']
      : ['React', 'Node.js', 'Express', 'PostgreSQL', 'RESTful APIs'],
    education: "Bachelor's Degree",
    strengths: [
      `Demonstrated competency aligned with ${bestRole} core objectives`,
      `Practical domain execution experience highlighted in background`,
      `Strong match with active organizational opening requirements`
    ],
    areasForImprovement: ['Practical evaluation during technical domain assessment'],
    evaluationSummary: `Applicant profile for ${extractedName} demonstrates strong alignment with requirements for the ${bestRole} position at ${appConfig.companyName}. Evaluation indicates a domain match score of ${bestMatchScore}%.`,
    rejectionReason: isSelected ? null : `Domain match score of ${bestMatchScore}% is below required hiring threshold.`,
    interviewQuestions: [
      `Can you discuss a key project or campaign you delivered in ${bestRole}?`,
      `How do you diagnose issues and optimize performance metrics?`,
      `What methodologies do you follow to ensure scalability and high quality?`
    ],
    proposedInterviewDate: interviewDate,
    emailSubject: isSelected 
      ? `🎯 Technical Assessment & Interview: ${bestRole} at ${appConfig.companyName}` 
      : `Application Update: ${bestRole} at ${appConfig.companyName}`,
    emailBody: isSelected
      ? `Dear ${extractedName},\n\nThank you for applying for the ${bestRole} position at ${appConfig.companyName}. We were impressed with your application and invite you to complete our online Technical Assessment.\n\nPlease find your unique assessment link in this email.\n\nBest regards,\n${appConfig.companyName} Recruitment Team`
      : `Dear ${extractedName},\n\nThank you for your interest in ${appConfig.companyName}. We have decided to proceed with other candidates whose experience aligns more closely with our active openings.\n\nBest regards,\n${appConfig.companyName} Recruitment Team`
  };
}

// Helper: Determine current public application base URL
function getAppBaseUrl(req = null) {
  if (req && req.headers && req.headers.host) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    return `${proto}://${req.headers.host}`;
  }
  if (process.env.RENDER || process.env.PORT === '10000') {
    return 'https://nexus-hr-workflow.onrender.com';
  }
  return `http://localhost:${PORT || 3000}`;
}

// ----------------- DOMAIN-SPECIFIC 20 MCQ QUESTION GENERATOR (ANTI-SERIES RANDOMIZER) ----------------- //

// True Fisher-Yates (Knuth) Array Shuffle Algorithm
function fisherYatesShuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate a strictly anti-pattern, balanced answer key for 20 MCQs
// Guarantees: Exactly 5 Option A (25%), 5 Option B (25%), 5 Option C (25%), 5 Option D (25%)
// Strict Anti-Series Constraints:
// 1. Max consecutive identical answers = 2 (never 3 in a row, e.g. no A, A, A)
// 2. No 2-element alternating cycles of length 4 (e.g. no A, B, A, B or C, D, C, D)
// 3. No 4-element sequence runs (e.g. no A, B, C, D or D, C, B, A)
function generateAntiPatternAnswerKey(totalQuestions = 20) {
  const countsPerOption = Math.floor(totalQuestions / 4); // 5 for 20 questions
  let baseKey = [];
  for (let opt = 0; opt < 4; opt++) {
    for (let c = 0; c < countsPerOption; c++) {
      baseKey.push(opt);
    }
  }

  function hasPattern(arr) {
    // Constraint 1: No 3 identical answers in a row
    for (let i = 2; i < arr.length; i++) {
      if (arr[i] === arr[i-1] && arr[i-1] === arr[i-2]) return true;
    }
    // Constraint 2: No 2-element alternating cycles of length 4 (e.g. A, B, A, B or B, C, B, C)
    for (let i = 3; i < arr.length; i++) {
      if (arr[i] === arr[i-2] && arr[i-1] === arr[i-3]) return true;
    }
    // Constraint 3: No 4-element sequential runs (0,1,2,3 or 3,2,1,0)
    for (let i = 3; i < arr.length; i++) {
      if (arr[i] === (arr[i-1]+1)%4 && arr[i-1] === (arr[i-2]+1)%4 && arr[i-2] === (arr[i-3]+1)%4) return true;
      if (arr[i] === (arr[i-1]+3)%4 && arr[i-1] === (arr[i-2]+3)%4 && arr[i-2] === (arr[i-3]+3)%4) return true;
    }
    return false;
  }

  let attempts = 0;
  while (attempts < 1000) {
    attempts++;
    const candidateKey = fisherYatesShuffle(baseKey);
    if (!hasPattern(candidateKey)) {
      return candidateKey;
    }
  }
  return fisherYatesShuffle(baseKey);
}

// Master MCQ Randomizer and Anti-Pattern Optimizer
function optimizeAndRandomizeMCQs(rawQuestions) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return [];
  
  // 1. Shuffle question list order with Fisher-Yates
  const shuffledQuestions = fisherYatesShuffle(rawQuestions).slice(0, 20);
  const targetAnswerKey = generateAntiPatternAnswerKey(shuffledQuestions.length);

  return shuffledQuestions.map((q, idx) => {
    const rawOptions = Array.isArray(q.options) && q.options.length === 4 
      ? q.options 
      : ["Option A", "Option B", "Option C", "Option D"];
    
    // Identify original correct option text
    const originalCorrectIdx = (typeof q.correctAnswerIndex === 'number' && q.correctAnswerIndex >= 0 && q.correctAnswerIndex <= 3)
      ? q.correctAnswerIndex
      : (typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3 ? q.correct : 0);
    
    const correctText = rawOptions[originalCorrectIdx] !== undefined ? rawOptions[originalCorrectIdx] : rawOptions[0];
    const incorrectOptions = rawOptions.filter((_, i) => i !== originalCorrectIdx);
    
    // Shuffle the 3 incorrect options with Fisher-Yates
    const shuffledIncorrect = fisherYatesShuffle(incorrectOptions);
    
    // Place correct option text at the assigned balanced targetKey position
    const targetIdx = targetAnswerKey[idx] !== undefined ? targetAnswerKey[idx] : Math.floor(Math.random() * 4);
    const finalOptions = [];
    let incPtr = 0;
    
    for (let pos = 0; pos < 4; pos++) {
      if (pos === targetIdx) {
        finalOptions.push(correctText);
      } else {
        finalOptions.push(shuffledIncorrect[incPtr++] || `Option ${String.fromCharCode(65 + pos)}`);
      }
    }

    return {
      id: idx + 1,
      question: q.question || q.q || `Question ${idx + 1}`,
      options: finalOptions,
      correctAnswerIndex: targetIdx
    };
  });
}

// Curated domain question banks for dynamic fallback & shuffling
const DOMAIN_QUESTION_BANKS = {
  marketing: [
    { q: "Which metric is the most effective indicator of overall paid search campaign profitability?", options: ["Return on Ad Spend (ROAS)", "Cost Per Click (CPC)", "Click-Through Rate (CTR)", "Quality Score"], correct: 0 },
    { q: "In Google Analytics 4 (GA4), how is the primary data model structured compared to Universal Analytics?", options: ["Event-based data model", "Session-based data model", "Pageview-only model", "Hit-type hierarchy model"], correct: 0 },
    { q: "What does 'Target CPA' bidding strategy optimize for in Google Ads?", options: ["Maximum conversions at or below your target cost per acquisition", "Maximum impressions at fixed daily spend", "Lowest possible CPC regardless of conversion quality", "Top of search page impression share"], correct: 0 },
    { q: "Which HTTP status code should be used for a permanent redirect to preserve maximum SEO link equity?", options: ["301 Moved Permanently", "302 Found", "307 Temporary Redirect", "308 Resume Incomplete"], correct: 0 },
    { q: "What is the primary function of the Meta (Facebook) Conversions API (CAPI)?", options: ["Send web events directly from server to Meta to bypass browser-side ad blockers", "Automatically generate video creatives using AI", "Track offline in-store walk-ins without user consent", "Increase organic Facebook group engagement"], correct: 0 },
    { q: "Which formula accurately calculates Customer Acquisition Cost (CAC)?", options: ["(Total Sales & Marketing Expenses) / (Number of New Customers Acquired)", "(Gross Revenue) / (Total Number of Leads Generated)", "(Ad Spend) * (Average Order Value)", "(Total Website Visitors) / (Active Paying Customers)"], correct: 0 },
    { q: "In SEO, what is the primary purpose of the 'canonical' (rel=canonical) link tag?", options: ["Prevent duplicate content issues by specifying the preferred master URL", "Block search engines from indexing sensitive private pages", "Speed up server-side DNS resolution for external assets", "Declare the primary target language for international visitors"], correct: 0 },
    { q: "What is the industry-standard benchmark formula for Click-Through Rate (CTR)?", options: ["(Total Clicks / Total Impressions) * 100", "(Total Conversions / Total Clicks) * 100", "(Total Revenue / Total Impressions) * 100", "(Total Sessions / Total Bounces) * 100"], correct: 0 },
    { q: "When designing an email marketing automation funnel, what does 'DMARC' policy protect against?", options: ["Domain spoofing, phishing, and unauthorized email impersonation", "Exceeding daily SMTP bandwidth limits", "High email unsubscribes and bounce rates", "Slow HTML rendering on mobile mail clients"], correct: 0 },
    { q: "In Performance Marketing, what does 'Lookalike Audience' mean in Meta Ads?", options: ["Audiences with similar demographics and behaviors to your existing high-value customers", "Users who clicked on competitor ads in the last 7 days", "Users who share identical IP subnets with your office", "Randomly sampled demographics across a target country"], correct: 0 },
    { q: "Which SEO on-page element has the strongest direct weight for keyword ranking relevance?", options: ["Page <title> tag and primary <h1> heading", "Footer copyright disclaimer", "Image alt tags on decorative icons", "Sidebar anchor text density"], correct: 0 },
    { q: "What is 'Attribution Modeling' in digital growth marketing?", options: ["Rule-based assignment of conversion credit across touchpoints in a customer journey", "Designing 3D brand mascots for social campaigns", "Calculating server response time across global CDNs", "A/B testing typography variants on landing pages"], correct: 0 },
    { q: "In Google Ads, what three factors primarily determine an Ad's 'Quality Score'?", options: ["Expected CTR, Ad Relevance, and Landing Page Experience", "Account Age, Total Monthly Spend, and Number of Active Campaigns", "Keyword Length, Bid Amount, and Ad Group Name", "Domain Authority, Backlink Count, and Social Shares"], correct: 0 },
    { q: "What does 'LTV:CAC ratio' of 4:1 typically signify for a SaaS business?", options: ["Strong marketing efficiency and healthy unit economics", "Severe overspending on paid customer acquisition", "Negative cash flow requiring immediate price cuts", "Zero organic search traffic growth"], correct: 0 },
    { q: "Which schema markup type is best suited for an e-commerce product landing page to show star ratings in Google SERP?", options: ["Product and AggregateRating Schema", "Article Schema", "LocalBusiness Schema", "FAQPage Schema only"], correct: 0 },
    { q: "What is the main advantage of A/B Split Testing landing pages with statistical significance?", options: ["Ensures conversion rate improvements are mathematically valid and not due to random chance", "Guarantees 100% organic ranking on page 1 of Google", "Eliminates the need for paid search advertising", "Reduces hosting bandwidth consumption by 50%"], correct: 0 },
    { q: "What is 'Robots.txt' used for in technical search engine optimization?", options: ["Instructing web crawlers which URLs or directories they may or may not crawl", "Securing user passwords and session cookies", "Compiling JavaScript bundles for mobile devices", "Redirecting broken 404 links automatically"], correct: 0 },
    { q: "In content marketing, what is a 'Hub and Spoke' (Topic Cluster) model?", options: ["A comprehensive pillar page linking to and from specific detailed sub-topic articles", "An ad network syndicating banners to partner blogs", "A centralized email dispatch server with multiple IP proxies", "A method for caching WordPress pages in Redis"], correct: 0 },
    { q: "What does 'Negative Keywords' prevent in Google Search Ads campaigns?", options: ["Prevent ads from triggering for irrelevant search queries, saving ad budget", "Prevent competitors from bidding on your brand name", "Penalize low-ranking search engine competitors", "Block spam bots from submitting web forms"], correct: 0 },
    { q: "In conversion rate optimization (CRO), what is 'Heatmap Tracking' primarily used to observe?", options: ["User clicks, mouse movement scrolls, and attention drop-off on a page", "Server temperature in cloud data centers", "Geographic locations of ad click fraud rings", "Email inbox delivery open rates over 24 hours"], correct: 0 }
  ],
  fullstack: [
    { q: "In React 18+, what is the primary benefit of the 'useTransition' hook?", options: ["Mark state updates as non-blocking transitions to keep the UI responsive", "Directly execute SQL queries on the browser", "Persist state to localStorage automatically", "Replace Redux store with zero configuration"], correct: 0 },
    { q: "In Node.js Event Loop architecture, in which phase are 'process.nextTick' callbacks processed?", options: ["Immediately after the current operation finishes, before moving to the next event loop phase", "During the Check (setImmediate) phase only", "Inside the Poll phase after I/O polling", "During DNS lookup execution only"], correct: 0 },
    { q: "What is the primary purpose of a Database Index (B-Tree) in PostgreSQL or MySQL?", options: ["Significantly speed up data retrieval (SELECT) at the cost of slight overhead on writes", "Encrypt columns with AES-256 automatically", "Prevent duplicate primary keys across foreign tables", "Compress table disk space by 90%"], correct: 0 },
    { q: "How does HTTPS establish secure encrypted communication between browser and server?", options: ["TLS Handshake using asymmetric public key cryptography to exchange a symmetric session key", "Hashing all payloads with MD5 before TCP transmission", "Obfuscating JSON keys with Base64 encoding", "Tunneling plain HTTP through multiple SOCKS5 proxies"], correct: 0 },
    { q: "In RESTful API design, which HTTP method should be strictly idempotent?", options: ["PUT and DELETE", "POST only", "PATCH only", "CONNECT only"], correct: 0 },
    { q: "What is the primary difference between SQL (Relational) and NoSQL (Document) databases?", options: ["SQL uses structured schemas with ACID transactions; NoSQL offers flexible schemas and horizontal scalability", "SQL cannot store JSON objects; NoSQL cannot store numbers", "NoSQL cannot handle more than 1000 concurrent users", "SQL is only executed on client browsers"], correct: 0 },
    { q: "In modern JavaScript (ES6+), what happens when a Promise rejects without a .catch() handler?", options: ["Triggers an 'unhandledRejection' event and can crash Node.js process if unhandled", "The browser ignores it silently and resumes execution", "Automatically retries the HTTP request 3 times", "Converts the rejection value into an empty string"], correct: 0 },
    { q: "What is 'Cross-Site Request Forgery' (CSRF) and how is it primarily mitigated?", options: ["Unauthorized commands transmitted from a trusted user; mitigated using SameSite cookies and Anti-CSRF tokens", "Injecting malicious script into DOM; mitigated by CSS escaping", "Brute-forcing admin passwords; mitigated by CAPTCHA", "Stealing JWT tokens from localStorage via XSS"], correct: 0 },
    { q: "In Docker containerization, what is the key advantage of multi-stage builds?", options: ["Reduces final production image size by separating build tools from runtime environment", "Enables running Windows containers on ARM architectures", "Automatically deploys containers to Kubernetes without yaml", "Doubles container CPU clock frequency"], correct: 0 },
    { q: "What does Redis primarily provide in a high-scale Full Stack web architecture?", options: ["In-memory caching, fast key-value store, pub/sub messaging, and rate limiting", "Persistent relational schema validation", "HTML template rendering in browser threads", "Long-term cold tape backup storage"], correct: 0 },
    { q: "In React, why should components NOT mutate state directly (e.g. state.count = 5)?", options: ["Direct mutation bypasses React's virtual DOM reconciliation and will not trigger re-renders", "Direct mutation corrupts browser memory heap", "React throws a compile-time syntax error on mutation", "State values become read-only constants in production"], correct: 0 },
    { q: "What is the primary benefit of Database Connection Pooling in Node.js backend services?", options: ["Reuses existing active DB connections rather than incurring the overhead of creating new TCP connections per request", "Translates SQL queries to MongoDB syntax automatically", "Prevents SQL injection vulnerabilities without parameterized queries", "Runs database queries in separate child processes"], correct: 0 },
    { q: "How does JWT (JSON Web Token) verify token integrity and authenticity?", options: ["Cryptographic digital signature (HMAC-SHA256 or RSA) verified against a secret or public key", "Checking the token string length against a random database record", "Querying the client's IP address on every request", "Encrypting the entire token with browser cookies"], correct: 0 },
    { q: "What is the primary purpose of CORS (Cross-Origin Resource Sharing) in web browsers?", options: ["A browser security mechanism that restricts web pages from making requests to a different domain unless permitted", "A protocol to compress image payloads across CDNs", "An automated tool to synchronize React state across tabs", "A server firewall that blocks DDoS attacks"], correct: 0 },
    { q: "In TypeScript, what is the difference between 'type' and 'interface'?", options: ["Interfaces support declaration merging and OOP extends; types support union, intersection, and primitive aliases", "Types only work with numbers; interfaces work with strings", "Interfaces are compiled to runtime JavaScript classes", "Types cannot be used with functions"], correct: 0 },
    { q: "What is 'Database Sharding' in distributed systems?", options: ["Horizontally partitioning rows across multiple database instances based on a shard key", "Creating read-only replicas in the same server rack", "Compressing database logs into ZIP archives", "Converting relational tables into CSV files"], correct: 0 },
    { q: "In Express.js, what is the role of the 'next()' function in middleware?", options: ["Passes control to the next middleware or route handler in the execution stack", "Restarts the HTTP server if an error occurs", "Sends an immediate 200 OK response to the client", "Disconnects the active database connection"], correct: 0 },
    { q: "What is the difference between WebSockets and Server-Sent Events (SSE)?", options: ["WebSockets provide bidirectional full-duplex communication; SSE provides unidirectional server-to-client streaming over HTTP", "SSE is binary only; WebSockets are text only", "WebSockets only work in Google Chrome", "SSE requires opening a new TCP connection for every message"], correct: 0 },
    { q: "Why is 'prepared statements' / parameterized queries the gold standard against SQL Injection?", options: ["Separates SQL code from user-supplied parameters, preventing inputs from being executed as SQL commands", "Encrypts the database hard drive with BitLocker", "Disables the DROP TABLE command across the database", "Removes all quotation marks from user inputs"], correct: 0 },
    { q: "In Next.js (App Router), what is the key advantage of Server Components?", options: ["Renders on the server with zero client-side JavaScript bundle overhead for non-interactive content", "Enables running PHP scripts inside React JSX", "Allows direct access to user's local filesystem", "Bypasses all CSS stylesheet rules"], correct: 0 }
  ]
};

// Generate 20 Unique, Shuffled MCQs for Candidate (Enforces Anti-Pattern & Balanced Distribution)
async function generateTestQuestionsForCandidate(candidateId, appliedRole) {
  const role = (appliedRole || 'Full Stack Developer').trim();
  const isMarketing = role.toLowerCase().includes('marketing') || role.toLowerCase().includes('seo');
  const domainKey = isMarketing ? 'marketing' : 'fullstack';
  const roleCategory = isMarketing ? 'Digital Marketing Specialist' : role;

  // Try Gemini LLM for dynamic AI generation
  const prompt = `
You are an expert Technical Examiner and Hiring Assessor for the role: "${roleCategory}".
Generate a comprehensive, professional technical assessment test consisting of exactly 20 Multiple Choice Questions (MCQs) evaluating practical competency, real-world scenario judgment, and core skills for a "${roleCategory}".

Requirements:
1. Exactly 20 questions numbered 1 to 20.
2. Each question must have 4 distinct, plausible options (A, B, C, D).
3. Exactly ONE option must be correct.
4. "correctAnswerIndex" must be an integer (0, 1, 2, or 3) indicating which option in "options" array is correct.
5. Create practical, insightful questions covering core principles, debugging, strategy, and best practices.

RETURN STRICT JSON ONLY (an array of 20 question objects, no markdown):
[
  {
    "id": 1,
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswerIndex": 0
  }
]
`;

  const modelsToTry = appConfig.models || ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.6-flash'];

  for (const model of modelsToTry) {
    try {
      const payload = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const rawQuestions = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${model}:generateContent?key=${appConfig.geminiApiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
          timeout: 18000
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            try {
              const resp = JSON.parse(d);
              if (resp.error) return reject(new Error(resp.error.message));
              const text = resp.candidates[0].content.parts[0].text;
              const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
              resolve(JSON.parse(clean));
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(payload);
        req.end();
      });

      if (Array.isArray(rawQuestions) && rawQuestions.length >= 15) {
        const randomized = optimizeAndRandomizeMCQs(rawQuestions);
        if (randomized.length === 20) {
          console.log(`✅ [Gemini Test Generator] Generated 20 anti-pattern randomized MCQs for ${roleCategory} using ${model}`);
          return randomized;
        }
      }
    } catch (err) {
      console.warn(`⚠️ [Test Generator] Model ${model} failed (${err.message}). Trying fallback...`);
    }
  }

  // High-Quality Randomized Fallback Bank with Fisher-Yates and Anti-Series Key
  console.log(`📋 [Test Generator] Using anti-pattern randomized question bank for "${roleCategory}"`);
  const bank = (DOMAIN_QUESTION_BANKS[domainKey] || DOMAIN_QUESTION_BANKS.fullstack).slice();
  return optimizeAndRandomizeMCQs(bank);
}

// HTML Email Template: Technical Assessment Test Invitation (Replaces Google Meet link)
function generateInterviewInviteTemplate({ candidate, req = null }) {
  const candidateName = candidate.name || 'Candidate';
  const role = candidate.role || 'Full Stack Developer';
  const baseUrl = getAppBaseUrl(req);
  const testToken = candidate.id || ('cand_' + Date.now().toString(36));
  const testLink = `${baseUrl}/assessment.html?token=${encodeURIComponent(testToken)}`;
  const interviewDate = candidate.proposedInterviewDate || candidate.interviewDate || getFormattedInterviewDate(3);

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Technical Assessment Invitation - ${appConfig.companyName}</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 30px 10px;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
            
            <!-- HEADER -->
            <tr>
              <td style="padding: 36px 32px 30px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); text-align: center; color: #ffffff;">
                <span style="display: inline-block; padding: 6px 14px; background: rgba(255,255,255,0.2); border-radius: 50px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">Technical Assessment & Interview Test</span>
                <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${appConfig.companyName}</h1>
                <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.95;">Target Position: <strong>${role}</strong></p>
              </td>
            </tr>

            <!-- BODY CONTENT -->
            <tr>
              <td style="padding: 32px;">
                <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">
                  Dear <strong>${candidateName}</strong>,
                </p>
                <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                  Congratulations! Following a comprehensive review of your resume and background for the <strong>${role}</strong> position, our hiring committee is delighted to invite you to take your official <strong>Online Technical Assessment Test</strong>.
                </p>

                <!-- TEST DETAILS CARD -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px; margin: 26px 0;">
                  <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 16px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                    📝 Assessment Guidelines & Schedule
                  </h3>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b; width: 140px;"><strong>Candidate Name:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${candidateName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Target Role:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${role}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Test Format:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a;">20 Multiple Choice Questions (Domain-Specific)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Time Limit:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #4f46e5; font-weight: 700;">⏱️ 30 Minutes (Strict Countdown)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Advancement Criteria:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #059669; font-weight: 700;">🏆 80% or Higher (Qualifies for Final 1-on-1 Interview)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Environment:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #dc2626; font-weight: 600;">🛡️ AI-Proctored (Anti-tab switch & copy locks)</td>
                    </tr>
                  </table>

                  <!-- START TEST CTA BUTTON -->
                  <div style="text-align: center; margin-top: 26px; margin-bottom: 10px;">
                    <a href="${testLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 800; padding: 15px 36px; border-radius: 10px; box-shadow: 0 4px 16px rgba(79, 70, 229, 0.35);">
                      🚀 Start 30-Minute Technical Assessment Test
                    </a>
                    <div style="margin-top: 12px;">
                      <a href="${testLink}" style="font-size: 12px; color: #6366f1; text-decoration: underline; word-break: break-all;">${testLink}</a>
                    </div>
                  </div>
                </div>

                <!-- IMPORTANT RULES -->
                <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 18px; margin: 24px 0; border-radius: 4px;">
                  <strong style="color: #92400e; font-size: 13px; text-transform: uppercase;">⚠️ Important Examination Instructions:</strong>
                  <ul style="padding-left: 18px; margin: 8px 0 0; font-size: 13px; color: #78350f; line-height: 1.5;">
                    <li>Ensure an uninterrupted internet connection and a quiet environment before starting.</li>
                    <li>Do <strong>NOT</strong> switch browser tabs or open external windows during the test; security triggers will log violations and auto-submit your exam.</li>
                    <li>You have <strong>30 minutes</strong> to complete all 20 questions. The test auto-submits when the timer hits zero.</li>
                    <li>Use the <strong>"Overview"</strong> button at the bottom to verify all answers before clicking <strong>"Submit"</strong>.</li>
                  </ul>
                </div>

                <p style="font-size: 14px; line-height: 1.6; color: #64748b;">
                  Candidates achieving <strong>80% or above</strong> will automatically advance to the <strong>Final 1-on-1 Technical & Cultural Interview Round</strong> with our hiring leadership panel.
                </p>

                <p style="font-size: 14px; line-height: 1.6; color: #64748b;">
                  If you encounter technical difficulties, reply directly to this email at <a href="mailto:${appConfig.hrEmail}" style="color: #4f46e5; text-decoration: none;">${appConfig.hrEmail}</a>.
                </p>

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px;">

                <!-- SIGNATURE -->
                <p style="font-size: 14px; color: #334155; margin: 0; line-height: 1.5;">
                  Wishing you the best on your assessment,<br>
                  <strong>Technical Recruitment & Hiring Council</strong><br>
                  ${appConfig.companyName}<br>
                  <span style="color: #64748b; font-size: 13px;">Official Recruiter: ${appConfig.hrEmail}</span>
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding: 20px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
                © ${new Date().getFullYear()} ${appConfig.companyName}. All rights reserved.<br>
                Dispatched automatically via Nexus HR Recruitment Platform.
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

// Generate deterministic Google Meet link
function generateGoogleMeetLink(seed = '') {
  const str = String(seed || Date.now().toString(36)).toLowerCase().replace(/[^a-z0-9]/g, '');
  const part1 = (str.slice(0, 3) + 'abc').slice(0, 3);
  const part2 = (str.slice(3, 7) + 'defg').slice(0, 4);
  const part3 = (str.slice(7, 10) + 'xyz').slice(0, 3);
  return `https://meet.google.com/${part1}-${part2}-${part3}`;
}

// HTML Email Template: Final Interview Round Invitation (Dispatched when Candidate Clears Assessment with Score >= 80%)
function generateFinalInterviewInviteTemplate({ candidate, score, correctCount, totalCount = 20, interviewDate, interviewTime, meetingLink }) {
  const candidateName = candidate.name || 'Candidate';
  const role = candidate.role || 'Full Stack Developer';
  const dateStr = interviewDate || candidate.interviewDate || candidate.proposedInterviewDate || getFormattedInterviewDate(2);
  const timeStr = interviewTime || candidate.interviewTime || '11:00 AM - 11:45 AM IST';
  const meetUrl = meetingLink || candidate.meetingLink || generateGoogleMeetLink(candidate.id || candidate.name);
  const interviewer = candidate.interviewerName || 'Engineering Hiring Panel & HR Leadership';
  const company = appConfig.companyName;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Final Interview Invitation - ${company}</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 30px 10px;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
            
            <!-- HEADER -->
            <tr>
              <td style="padding: 36px 32px 30px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); text-align: center; color: #ffffff;">
                <span style="display: inline-block; padding: 6px 14px; background: rgba(255,255,255,0.2); border-radius: 50px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">🎉 Assessment Cleared!</span>
                <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Final Interview Round</h1>
                <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.95;">Position: <strong>${role}</strong> at ${company}</p>
              </td>
            </tr>

            <!-- BODY CONTENT -->
            <tr>
              <td style="padding: 32px;">
                <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">
                  Dear <strong>${candidateName}</strong>,
                </p>
                <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                  Congratulations on clearing the online technical assessment with a score of <strong>${score}%</strong> (${correctCount}/${totalCount} questions correct)!
                </p>
                <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                  Based on your exceptional performance, our hiring council is pleased to invite you to the <strong>Final Round: 1-on-1 Technical Deep-Dive & Cultural Alignment Interview</strong>.
                </p>

                <!-- INTERVIEW SCHEDULE CARD -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px; margin: 26px 0;">
                  <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 16px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                    📅 Final Round Schedule & Video Link
                  </h3>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b; width: 140px;"><strong>Candidate:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${candidateName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Target Role:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${role}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Assessment Score:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #059669; font-weight: 700;">${score}% (${correctCount}/${totalCount} Correct — Cleared)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Date:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${dateStr}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Time & Duration:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0284c7; font-weight: 700;">${timeStr} (45 Minutes)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Format:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a;">1-on-1 Video Conference (Technical & Leadership Panel)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Interview Panel:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #0f172a;">${interviewer}</td>
                    </tr>
                  </table>

                  <!-- JOIN MEETING BUTTON -->
                  <div style="text-align: center; margin-top: 26px; margin-bottom: 10px;">
                    <a href="${meetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 800; padding: 15px 36px; border-radius: 10px; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.35);">
                      🎥 Join Google Meet Video Interview
                    </a>
                    <div style="margin-top: 12px;">
                      <a href="${meetUrl}" style="font-size: 12px; color: #0284c7; text-decoration: underline; word-break: break-all;">${meetUrl}</a>
                    </div>
                  </div>
                </div>

                <!-- WHAT TO EXPECT -->
                <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 14px 18px; margin: 24px 0; border-radius: 4px;">
                  <strong style="color: #0369a1; font-size: 13px; text-transform: uppercase;">💡 What to Expect in the Final Round:</strong>
                  <ul style="padding-left: 18px; margin: 8px 0 0; font-size: 13px; color: #0c4a6e; line-height: 1.5;">
                    <li><strong>Architecture & Project Deep-Dive:</strong> Discussion of key projects from your resume and domain problem-solving.</li>
                    <li><strong>Team & Cultural Alignment:</strong> Collaboration approach, technical ownership, and vision for the ${role} role.</li>
                    <li><strong>Q&A Session:</strong> An open session for you to ask questions about our roadmap, tech stack, and engineering culture.</li>
                  </ul>
                </div>

                <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin-top: 24px;">
                  Please confirm your availability by replying directly to this email. If you need to request an alternate time, let us know as soon as possible.
                </p>

                <p style="font-size: 15px; line-height: 1.6; margin-bottom: 0; color: #334155;">
                  Best regards,<br>
                  <strong>${company} Talent Acquisition Team</strong><br>
                  <span style="font-size: 13px; color: #64748b;">${appConfig.hrEmail}</span>
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
                © ${new Date().getFullYear()} ${company}. All rights reserved. Confidential Recruitment Correspondence.
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


// HTML Email Template: Assessment Outcome Rejection & Constructive Feedback (For Score < 80%)
function generateAssessmentRejectionTemplate({ candidate, score, correctCount, totalCount = 20 }) {
  const candidateName = candidate.name || 'Candidate';
  const role = candidate.role || 'Applied Role';

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Assessment Outcome - ${appConfig.companyName}</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 30px 10px;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
            
            <!-- HEADER -->
            <tr>
              <td style="padding: 36px 32px 30px; background: linear-gradient(135deg, #475569 0%, #334155 100%); text-align: center; color: #ffffff;">
                <span style="display: inline-block; padding: 6px 14px; background: rgba(255,255,255,0.15); border-radius: 50px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">Technical Assessment Results</span>
                <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${appConfig.companyName}</h1>
                <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.9;">Position: <strong>${role}</strong></p>
              </td>
            </tr>

            <!-- BODY CONTENT -->
            <tr>
              <td style="padding: 32px;">
                <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">
                  Dear <strong>${candidateName}</strong>,
                </p>
                <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                  Thank you for taking the time to complete the 30-minute technical domain assessment for the <strong>${role}</strong> position at ${appConfig.companyName}. We truly appreciate your effort and dedication throughout our recruitment process.
                </p>

                <!-- SCORE REPORT CARD -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px; margin: 26px 0;">
                  <h3 style="margin-top: 0; margin-bottom: 14px; font-size: 16px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                    📊 Assessment Score Summary
                  </h3>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b; width: 150px;"><strong>Candidate Score:</strong></td>
                      <td style="padding: 6px 0; font-size: 16px; color: #dc2626; font-weight: 800;">${score}% (${correctCount} / ${totalCount} correct)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Qualifying Threshold:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #059669; font-weight: 700;">80% (Minimum 16 / 20 required)</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;"><strong>Outcome:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #64748b;">Application Not Advancing</td>
                    </tr>
                  </table>
                </div>

                <p style="font-size: 15px; line-height: 1.6; color: #475569;">
                  While you demonstrated strong potential, our team requires a minimum benchmark of <strong>80%</strong> on this domain competency test for candidate advancement to final onboarding. As a result, we are unable to extend an offer for this role at this time.
                </p>

                <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 16px 20px; margin: 24px 0; border-radius: 6px;">
                  <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.6;">
                    We encourage you to continue deepening your technical mastery in ${role} domain fundamentals, performance metrics, and advanced practical implementations. We keep candidate profiles on file and welcome you to re-apply after 6 months.
                  </p>
                </div>

                <p style="font-size: 14px; line-height: 1.6; color: #64748b;">
                  We wish you the very best in your career pursuits and thank you once again for your interest in joining ${appConfig.companyName.replace(/\.+$/, '')}.
                </p>

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px;">

                <!-- SIGNATURE -->
                <p style="font-size: 14px; color: #334155; margin: 0; line-height: 1.5;">
                  Sincerely,<br>
                  <strong>Manasvi Paliwal & The Talent Acquisition Team</strong><br>
                  ${appConfig.companyName}<br>
                  <span style="color: #64748b; font-size: 13px;">Direct Contact: ${appConfig.hrEmail}</span>
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding: 20px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
                © ${new Date().getFullYear()} ${appConfig.companyName}. All rights reserved.<br>
                Official Examination Notification • Confidential
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

// ----------------- MULTI-TRANSPORT UNIVERSAL EMAIL ENGINE ----------------- //
const FAILED_EMAILS_FILE = path.join(__dirname, 'failed_email_queue.json');

function getFailedEmails() {
  try {
    if (fs.existsSync(FAILED_EMAILS_FILE)) {
      return JSON.parse(fs.readFileSync(FAILED_EMAILS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveFailedEmails(queue) {
  try {
    fs.writeFileSync(FAILED_EMAILS_FILE, JSON.stringify(queue, null, 2), 'utf8');
  } catch (e) {}
}

function queueFailedEmail(item) {
  const q = getFailedEmails();
  const existingIdx = q.findIndex(x => x.candidateId === item.candidateId || (x.toEmail === item.toEmail && x.subject === item.subject));
  if (existingIdx >= 0) {
    q[existingIdx] = { ...q[existingIdx], ...item, queuedAt: new Date().toISOString() };
  } else {
    q.push({ ...item, queuedAt: new Date().toISOString(), attempts: 1 });
  }
  saveFailedEmails(q);
}

function removeFailedEmail(candidateId, toEmail) {
  let q = getFailedEmails();
  q = q.filter(x => !(x.candidateId === candidateId || x.toEmail === toEmail));
  saveFailedEmails(q);
}

// Transport 1: HTTPS Webhook Relay (Google Apps Script / Cloudflare Worker / Custom HTTP endpoint over Port 443)
async function dispatchViaHttpsRelay(relayUrl, toEmail, subject, htmlContent, textFallback = '') {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        to: toEmail,
        toEmail: toEmail,
        subject: subject,
        html: htmlContent,
        htmlContent: htmlContent,
        text: textFallback || htmlContent.replace(/<[^>]+>/g, ' '),
        body: textFallback || htmlContent.replace(/<[^>]+>/g, ' '),
        fromName: `${appConfig.companyName} Recruitment Team`,
        fromEmail: appConfig.hrEmail
      });

      const parsed = new URL(relayUrl);
      const client = parsed.protocol === 'https:' ? https : require('http');

      const req = client.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            console.log(`🌐 [HTTPS Relay SUCCESS] Email dispatched via ${parsed.hostname} to ${toEmail}`);
            resolve({ success: true, messageId: `relay_${Date.now()}`, transport: 'https_relay' });
          } else {
            console.warn(`⚠️ [HTTPS Relay Error] Status: ${res.statusCode} ${data}`);
            resolve({ success: false, error: `Relay responded with status ${res.statusCode}` });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: `Relay request error: ${err.message}` });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Relay connection timed out' });
      });

      req.write(payload);
      req.end();
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

// Transport 2: Resend API over HTTPS (Port 443)
async function dispatchViaResendApi(apiKey, toEmail, subject, htmlContent, textFallback = '') {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        from: `"${appConfig.companyName}" <onboarding@resend.dev>`,
        to: [toEmail],
        subject: subject,
        html: htmlContent,
        text: textFallback || ''
      });

      const req = https.request({
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`🚀 [Resend API SUCCESS] Delivered to ${toEmail}, ID: ${parsed.id}`);
              resolve({ success: true, messageId: parsed.id, transport: 'resend_api' });
            } else {
              resolve({ success: false, error: parsed.message || `Resend HTTP ${res.statusCode}` });
            }
          } catch (e) {
            resolve({ success: false, error: data });
          }
        });
      });

      req.on('error', (err) => resolve({ success: false, error: `Resend error: ${err.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Resend timed out' }); });
      req.write(payload);
      req.end();
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

// Singleton Pooled Transporter to prevent Google "Too many login attempts" (454-4.7.0)
let cachedTransporter = null;
let lastTransporterKey = null;

function getPooledTransporter(user, pass) {
  const key = `${user}:${pass}`;
  if (cachedTransporter && lastTransporterKey === key) {
    return cachedTransporter;
  }
  cachedTransporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    rateDelta: 1000,
    rateLimit: 1,
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
  lastTransporterKey = key;
  return cachedTransporter;
}

// Master Multi-Transport Dispatcher
async function sendCandidateCustomEmail(toEmail, subject, htmlContent, textFallback = '') {
  // 1. Try HTTPS Webhook Relay if configured (Port 443 - zero firewall blocks on Render)
  if (appConfig.emailRelayUrl && appConfig.emailRelayUrl.trim().length > 5) {
    const relayRes = await dispatchViaHttpsRelay(appConfig.emailRelayUrl.trim(), toEmail, subject, htmlContent, textFallback);
    if (relayRes.success) return relayRes;
    console.warn(`⚠️ HTTPS Relay notice (${relayRes.error}). Trying fallback transports...`);
  }

  // 2. Try Resend API if API Key is configured (Port 443)
  if (appConfig.resendApiKey && appConfig.resendApiKey.trim().length > 5) {
    const resendRes = await dispatchViaResendApi(appConfig.resendApiKey.trim(), toEmail, subject, htmlContent, textFallback);
    if (resendRes.success) return resendRes;
    console.warn(`⚠️ Resend API notice (${resendRes.error}). Trying direct SMTP fallback...`);
  }

  // 3. Direct Gmail SMTP with Strict Connection Timeout and Reused Pool
  let cleanPassword = (appConfig.gmailAppPassword || '').replace(/\s+/g, '');
  if (!cleanPassword || cleanPassword === 'YOUR_GMAIL_APP_PASSWORD') {
    cleanPassword = 'YOUR_GMAIL_APP_PASSWORD';
  }

  const transporter = getPooledTransporter(appConfig.hrEmail, cleanPassword);

  const mailOptions = {
    from: `"${appConfig.companyName} Recruitment Team" <${appConfig.hrEmail}>`,
    to: toEmail,
    subject: subject,
    text: textFallback || "Please view this email in an HTML-compatible client.",
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ [Gmail SMTP SUCCESS] ID: ${info.messageId} delivered to ${toEmail} (${subject})`);
    return { success: true, messageId: info.messageId, transport: 'gmail_smtp' };
  } catch (err) {
    const isPortBlocked = err.code === 'ETIMEDOUT' || err.message.includes('timeout') || err.message.includes('ECONNREFUSED');
    if (isPortBlocked) {
      console.error(`❌ [SMTP Cloud Firewall Block]: Outbound SMTP to smtp.gmail.com blocked by hosting environment (${err.message})`);
    } else {
      console.error("❌ [Custom Email Dispatch Error]:", err.message);
    }
    return {
      success: false,
      error: isPortBlocked ? "Outbound SMTP blocked by cloud provider (Render Free Tier blocks ports 25, 465, 587). Please configure EMAIL_RELAY_URL in settings." : err.message,
      portBlocked: isPortBlocked
    };
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

function shouldIgnoreSender(fromAddr, subject = '') {
  if (!fromAddr) return true;
  const lowerFrom = fromAddr.toLowerCase();
  const lowerSubj = (subject || '').toLowerCase();

  // 1. Never evaluate emails sent by the recruiter's own address
  if (appConfig.hrEmail && lowerFrom.includes(appConfig.hrEmail.toLowerCase())) {
    return true;
  }

  // 2. Ignore outgoing HR template subjects
  if (
    lowerSubj.includes('regarding your application') ||
    lowerSubj.includes('interview invitation:') ||
    lowerSubj.includes('recruitment system connected') ||
    lowerSubj.includes('pipeline verification')
  ) {
    return true;
  }

  return IGNORE_DOMAINS.some(domain => lowerFrom.includes(domain));
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
  if (shouldIgnoreSender(fromAddr, subject)) {
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
  const matchedRole = evaluation.appliedRole || appliedRole;
  const baseUrl = getAppBaseUrl();
  const testLink = `${baseUrl}/assessment.html?token=${encodeURIComponent(candId)}`;

  // Calculate verified, future-guaranteed interview & joining dates
  const interviewDate = validateAndSanitizeInterviewDate(evaluation.proposedInterviewDate, new Date());
  const joiningDate = getFormattedJoiningDate(3, interviewDate);
  const interviewTime = '30 Minutes Online Technical Assessment';
  const interviewerName = `${appConfig.companyName} Technical Hiring Council`;

  const cleanEmailBody = sanitizeEmailBodyDates(evaluation.emailBody, interviewDate);

  // Generate domain test questions if candidate is SELECTED
  let testQuestions = [];
  if (evaluation.decision === 'SELECTED') {
    testQuestions = await generateTestQuestionsForCandidate(candId, matchedRole);
  }

  const candidateRecord = {
    id: candId,
    name: evaluation.candidateName || fromName,
    email: primarySenderEmail,
    resumeEmail: resumeExtractedEmail,
    phone: evaluation.candidatePhone || 'N/A',
    role: matchedRole,
    decision: evaluation.decision,
    matchScore: evaluation.matchScore,
    status: evaluation.decision === 'SELECTED' ? 'TEST_ASSIGNED' : 'REJECTED',
    testStatus: evaluation.decision === 'SELECTED' ? 'ASSIGNED' : 'N/A',
    testToken: candId,
    testLink: testLink,
    testQuestions: testQuestions,
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
    interviewRound: 'Domain Technical MCQ Assessment (20 Questions / 30 Mins)',
    interviewerName: interviewerName,
    workMode: 'Hybrid (3 Days Office / 2 Days Remote)',
    workLocation: `${appConfig.companyName} Campus, Cyber City, Bangalore`,
    employmentType: 'Full-Time Permanent',
    department: matchedRole.toLowerCase().includes('marketing') ? 'Growth & Digital Marketing' : 'Core Engineering & Technology',
    location: 'Bangalore, India / Open to Relocation',
    salaryOffer: 'Competitive / Market Standard (Finalized upon Offer)',
    interviewStatus: evaluation.decision === 'SELECTED' ? `Assessment Test Assigned (30 Mins / 20 MCQs)` : 'N/A',
    emailSubject: evaluation.decision === 'SELECTED' 
      ? `🎯 Technical Assessment & Interview: ${matchedRole} at ${appConfig.companyName}` 
      : (evaluation.emailSubject || `Application Update: ${matchedRole}`),
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
      candidateRecord.emailDeliveryStatus = 'DELIVERED';
      candidateRecord.emailTransport = dispatchResult.transport || 'direct';
      removeFailedEmail(candidateRecord.id, primarySenderEmail);
    } else {
      console.error(`   ⚠️ [Auto-Dispatch Notice]:`, dispatchResult ? dispatchResult.error : 'Dispatch failure');
      candidateRecord.emailDeliveryStatus = 'FAILED';
      candidateRecord.emailDeliveryError = dispatchResult ? dispatchResult.error : 'Dispatch failure';
      queueFailedEmail({
        candidateId: candidateRecord.id,
        toEmail: primarySenderEmail,
        subject: candidateRecord.emailSubject,
        html: evaluation.decision === 'SELECTED' ? generateInterviewInviteTemplate({ candidate: candidateRecord }) : null,
        body: cleanEmailBody
      });
    }
  }

  // Save Candidate with clean deduplication
  let candidates = getCandidates();
  candidates = candidates.filter(c => 
    c.id !== candidateRecord.id && 
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

// Single Scan of [Gmail]/All Mail & INBOX
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
    authTimeout: 12000,
    connTimeout: 15000
  });

  let safetyTimeout = null;

  const cleanup = () => {
    if (safetyTimeout) clearTimeout(safetyTimeout);
    isScanInProgress = false;
    try {
      if (imap && imap.state !== 'disconnected') {
        imap.end();
      }
    } catch (e) {}
  };

  safetyTimeout = setTimeout(() => {
    console.warn('⚠️ [IMAP Scanner] Scan timed out after 120 seconds. Releasing lock.');
    cleanup();
  }, 120000);

  imap.once('ready', () => {
    // Try opening [Gmail]/All Mail first (contains 100% of received/categorized emails), fallback to INBOX
    const targetBox = '[Gmail]/All Mail';
    imap.openBox(targetBox, false, (err, box) => {
      if (err) {
        console.warn(`⚠️ [IMAP Scanner] Failed to open ${targetBox} (${err.message}). Trying INBOX...`);
        imap.openBox('INBOX', false, (err2, box2) => {
          if (err2) {
            console.error(`⚠️ [IMAP Scanner] Failed to open INBOX (${err2.message})`);
            cleanup();
            return;
          }
          performScanOnOpenBox(box2, 'INBOX');
        });
        return;
      }
      performScanOnOpenBox(box, targetBox);
    });

    function performScanOnOpenBox(box, boxName) {
      scannerStats.lastScanTime = new Date().toISOString();
      scannerStats.totalScans++;
      scannerStats.status = `Watching ${boxName} (${box.messages.total} messages)`;

      const total = box.messages.total;
      if (total === 0) {
        cleanup();
        return;
      }

      const processedUIDs = getProcessedUIDs();
      const startSeq = Math.max(1, total - 29); // Inspect last 30 messages
      const endSeq = total;

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
          const rawMsgId = msgIdMatch ? msgIdMatch[1].trim() : '';
          const subjStr = subjMatch ? subjMatch[1].toLowerCase() : '';

          if (fromStr && shouldIgnoreSender(fromStr, subjStr)) {
            if (rawMsgId) markUIDProcessed(null, rawMsgId);
            return;
          }

          if (rawMsgId && processedUIDs.includes(rawMsgId)) {
            return;
          }

          candidateSeqsToFetch.push({ seqno, uid, msgId: rawMsgId });
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

        console.log(`🔍 [${boxName} Scanner] Found ${candidateSeqsToFetch.length} new unprocessed message(s). Fetching details...`);

        for (const item of candidateSeqsToFetch) {
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
                    const processed = await processCandidateEmailRecord(parsed, item.uid);
                    if (processed && item.msgId) {
                      markUIDProcessed(item.uid, item.msgId);
                    }
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
    }
  });

  imap.once('error', (err) => {
    console.error('IMAP connection error:', err.message);
    cleanup();
  });

  imap.once('close', () => {
    cleanup();
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
      frequency: "Every 10 Seconds (Continuous Live Scanner)",
      filterRule: "STRICT: Only emails with .pdf, .docx, .doc resume attachments"
    }
  });
});

// 2. Manual Immediate Trigger
app.post('/api/scan-inbox', async (req, res) => {
  console.log("⚡ [Manual Trigger] Scanning [Gmail]/All Mail & INBOX immediately upon user request...");
  scanInboxNow();
  res.json({ success: true, message: "Mailbox scan triggered immediately!" });
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
      emailMessageId: candidateData.emailMessageId || null,
      emailDeliveryStatus: candidateData.emailDeliveryStatus || (candidateData.emailMessageId ? 'DELIVERED' : 'PENDING'),
      emailTransport: candidateData.emailTransport || null,
      emailSubject: candidateData.emailSubject || '',
      emailBody: candidateData.emailBody || '',
      emailSentAt: candidateData.emailSentAt || (candidateData.emailMessageId ? now : null),
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
    const targetRole = appliedRole || evaluation.appliedRole || 'Full Stack Developer';
    const baseUrl = getAppBaseUrl(req);
    const testLink = `${baseUrl}/assessment.html?token=${encodeURIComponent(candId)}`;

    // Calculate verified, future-guaranteed interview & joining dates
    const interviewDate = validateAndSanitizeInterviewDate(evaluation.proposedInterviewDate, new Date());
    const joiningDate = getFormattedJoiningDate(3, interviewDate);
    const interviewTime = '30 Minutes Online Technical Assessment';
    const interviewerName = `${appConfig.companyName} Technical Hiring Council`;

    const cleanEmailBody = sanitizeEmailBodyDates(evaluation.emailBody, interviewDate);

    // Generate domain test questions if candidate is SELECTED
    let testQuestions = [];
    if (evaluation.decision === 'SELECTED') {
      testQuestions = await generateTestQuestionsForCandidate(candId, targetRole);
    }

    const candidateRecord = {
      id: candId,
      name: evaluation.candidateName || candidateName || 'Candidate',
      email: candidateEmail || evaluation.candidateEmail || 'N/A',
      phone: evaluation.candidatePhone || 'N/A',
      role: targetRole,
      decision: evaluation.decision,
      matchScore: evaluation.matchScore,
      status: evaluation.decision === 'SELECTED' ? 'TEST_ASSIGNED' : 'REJECTED',
      testStatus: evaluation.decision === 'SELECTED' ? 'ASSIGNED' : 'N/A',
      testToken: candId,
      testLink: testLink,
      testQuestions: testQuestions,
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
      interviewRound: 'Domain Technical MCQ Assessment (20 Questions / 30 Mins)',
      interviewerName: interviewerName,
      workMode: 'Hybrid (3 Days Office / 2 Days Remote)',
      workLocation: `${appConfig.companyName} Campus, Cyber City, Bangalore`,
      employmentType: 'Full-Time Permanent',
      department: targetRole.toLowerCase().includes('marketing') ? 'Growth & Digital Marketing' : 'Core Engineering & Technology',
      location: 'Bangalore, India / Open to Relocation',
      salaryOffer: 'Competitive / Market Standard (Finalized upon Offer)',
      interviewStatus: evaluation.decision === 'SELECTED' ? `Assessment Test Assigned (30 Mins / 20 MCQs)` : 'N/A',
      emailSubject: evaluation.decision === 'SELECTED' 
        ? `🎯 Technical Assessment & Interview: ${targetRole} at ${appConfig.companyName}` 
        : (evaluation.emailSubject || `Application Update: ${targetRole}`),
      emailBody: cleanEmailBody,
      emailSentAt: now,
      createdAt: now,
      updatedAt: now,
      source: fileName === 'Direct Submission' ? 'Dashboard Submission' : `File Upload (${fileName})`
    };

    if (candidateEmail && candidateEmail.includes('@') && appConfig.autoSendEmails) {
      if (evaluation.decision === 'SELECTED') {
        const inviteHtml = generateInterviewInviteTemplate({ candidate: candidateRecord, req });
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

// ----------------- TECHNICAL ASSESSMENT REST API ENDPOINTS ----------------- //

// 7a. Get Candidate Assessment Details & 20 MCQs (Removes correctAnswerIndex for security)
app.get('/api/test/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const candidates = getCandidates();
    const candidate = candidates.find(c => c.id === token || (c.email && c.email.toLowerCase() === token.toLowerCase()));

    if (!candidate) {
      return res.status(404).json({ success: false, error: "Assessment link is invalid or candidate not found." });
    }

    // If test is already completed
    if (candidate.testStatus === 'COMPLETED' || candidate.status === 'HIRED' || (candidate.decision === 'REJECTED' && candidate.testScore !== undefined)) {
      return res.json({
        success: true,
        candidate: {
          id: candidate.id,
          name: candidate.name,
          role: candidate.role,
          email: candidate.email,
          status: candidate.status,
          decision: candidate.decision,
          testStatus: candidate.testStatus || 'COMPLETED',
          testScore: candidate.testScore
        },
        questions: []
      });
    }

    // Generate or retrieve questions
    if (!candidate.testQuestions || candidate.testQuestions.length === 0) {
      console.log(`🤖 Generating fresh 20 MCQs for candidate "${candidate.name}" (${candidate.role})...`);
      candidate.testQuestions = await generateTestQuestionsForCandidate(candidate.id, candidate.role);
      candidate.testStatus = 'ASSIGNED';
      saveCandidates(candidates);
      syncCandidateToCloud(candidate);
    }

    // Sanitize questions for candidate frontend (strip correctAnswerIndex)
    const clientQuestions = candidate.testQuestions.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options
    }));

    res.json({
      success: true,
      candidate: {
        id: candidate.id,
        name: candidate.name,
        role: candidate.role,
        email: candidate.email,
        testStatus: candidate.testStatus
      },
      questions: clientQuestions
    });
  } catch (err) {
    console.error("Test fetch error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7b. Start Assessment Session
app.post('/api/test/:token/start', (req, res) => {
  try {
    const token = req.params.token;
    const candidates = getCandidates();
    const index = candidates.findIndex(c => c.id === token || (c.email && c.email.toLowerCase() === token.toLowerCase()));

    if (index === -1) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    candidates[index].testStatus = 'IN_PROGRESS';
    candidates[index].testStartedAt = new Date().toISOString();
    candidates[index].interviewStatus = 'Assessment Test In Progress (30 Mins Timer)';

    saveCandidates(candidates);
    broadcastSSE('candidate_updated', { candidate: candidates[index] });
    syncCandidateToCloud(candidates[index]);

    res.json({ success: true, message: "Assessment session started" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7c. Submit Assessment Session & Trigger Automated Pass/Fail Workflows
app.post('/api/test/:token/submit', async (req, res) => {
  try {
    const token = req.params.token;
    const { answers = {}, durationTaken = 0, cheatViolations = 0, isAutoTimeout = false } = req.body;
    const candidates = getCandidates();
    const index = candidates.findIndex(c => c.id === token || (c.email && c.email.toLowerCase() === token.toLowerCase()));

    if (index === -1) {
      return res.status(404).json({ success: false, error: "Candidate not found" });
    }

    const candidate = candidates[index];
    const questions = candidate.testQuestions || [];

    if (questions.length === 0) {
      return res.status(400).json({ success: false, error: "No test questions found for candidate." });
    }

    // Grade answers against secret key
    let correctCount = 0;
    const totalCount = questions.length; // 20
    const detailedResults = [];

    questions.forEach((q, idx) => {
      const userSelected = answers[idx] !== undefined ? answers[idx] : null;
      const isCorrect = userSelected !== null && userSelected === q.correctAnswerIndex;
      if (isCorrect) correctCount++;

      detailedResults.push({
        questionId: q.id,
        question: q.question,
        options: q.options,
        userAnswerIndex: userSelected,
        userAnswerText: userSelected !== null ? q.options[userSelected] : 'Not Answered',
        correctAnswerIndex: q.correctAnswerIndex,
        correctAnswerText: q.options[q.correctAnswerIndex],
        isCorrect
      });
    });

    const scorePercentage = Math.round((correctCount / totalCount) * 100);
    const isPassed = scorePercentage >= 80; // STRICT 80% THRESHOLD
    const now = new Date().toISOString();

    // Update Candidate Test Telemetry
    candidate.testScore = scorePercentage;
    candidate.testCorrectCount = correctCount;
    candidate.testTotalCount = totalCount;
    candidate.testCompletedAt = now;
    candidate.testDurationSeconds = durationTaken;
    candidate.testCheatViolations = cheatViolations;
    candidate.testAnswers = answers;
    candidate.testDetailedResults = detailedResults;
    candidate.testStatus = 'COMPLETED';
    candidate.updatedAt = now;

    console.log(`\n===============================================================`);
    console.log(`📊 [ASSESSMENT SUBMITTED] Candidate: ${candidate.name} (${candidate.role})`);
    console.log(`   Score:       ${scorePercentage}% (${correctCount}/${totalCount} Correct)`);
    console.log(`   Threshold:   80% -> Decision: ${isPassed ? 'FINAL INTERVIEW QUALIFIED' : 'REJECTED'}`);
    console.log(`   Duration:    ${Math.floor(durationTaken / 60)}m ${durationTaken % 60}s | Security Violations: ${cheatViolations}`);

    let emailSentResult = null;

    // 🎯 WORKFLOW PATH 1: SCORE >= 80% -> AUTOMATIC FINAL 1-ON-1 INTERVIEW ROUND
    if (isPassed) {
      candidate.status = 'INTERVIEW_SCHEDULED';
      candidate.decision = 'SELECTED';
      candidate.interviewRound = 'Final Technical & HR Interview';
      candidate.interviewStatus = `🎉 Passed Assessment (${scorePercentage}%) — Final Interview Scheduled`;

      const resolvedInterviewDate = candidate.interviewDate || candidate.proposedInterviewDate || getFormattedInterviewDate(2);
      candidate.interviewDate = resolvedInterviewDate;
      candidate.proposedInterviewDate = resolvedInterviewDate;
      candidate.interviewTime = candidate.interviewTime || '11:00 AM - 11:45 AM IST';
      
      if (!candidate.meetingLink) {
        candidate.meetingLink = generateGoogleMeetLink(candidate.id || candidate.name);
      }

      const interviewSubject = `🎉 Next Round: Final Interview for ${candidate.role} at ${appConfig.companyName}`;
      const interviewHtml = generateFinalInterviewInviteTemplate({
        candidate,
        score: scorePercentage,
        correctCount,
        totalCount,
        interviewDate: resolvedInterviewDate,
        interviewTime: candidate.interviewTime,
        meetingLink: candidate.meetingLink
      });

      console.log(`🚀 [Auto-Interview Trigger] Score ${scorePercentage}% >= 80%. Dispatching Final Round Interview Invitation to ${candidate.email}...`);
      if (candidate.email && candidate.email.includes('@') && appConfig.autoSendEmails) {
        emailSentResult = await sendCandidateCustomEmail(candidate.email, interviewSubject, interviewHtml);
        if (emailSentResult && emailSentResult.success) {
          candidate.emailSubject = interviewSubject;
          candidate.emailSentAt = now;
        }
      }
    }
    // 🎯 WORKFLOW PATH 2: SCORE < 80% -> AUTOMATIC CONSTRUCTIVE REJECTION EMAIL
    else {
      candidate.status = 'REJECTED';
      candidate.decision = 'REJECTED';
      candidate.rejectionReason = `Technical Assessment score was ${scorePercentage}% (Passing threshold is 80%).`;
      candidate.interviewStatus = `Assessment Completed (Score: ${scorePercentage}% - Rejected)`;

      const rejectSubject = `Application Update: ${candidate.role} at ${appConfig.companyName}`;
      const rejectHtml = generateAssessmentRejectionTemplate({
        candidate,
        score: scorePercentage,
        correctCount,
        totalCount
      });

      console.log(`📋 [Auto-Rejection Trigger] Score ${scorePercentage}% < 80%. Dispatching Feedback email to ${candidate.email}...`);
      if (candidate.email && candidate.email.includes('@') && appConfig.autoSendEmails) {
        emailSentResult = await sendCandidateCustomEmail(candidate.email, rejectSubject, rejectHtml);
        if (emailSentResult && emailSentResult.success) {
          candidate.emailSubject = rejectSubject;
          candidate.emailSentAt = now;
        }
      }
    }

    saveCandidates(candidates);
    broadcastSSE('candidate_updated', { candidate, testResult: { score: scorePercentage, passed: isPassed } });
    broadcastSSE('test_completed', { candidateId: candidate.id, score: scorePercentage, passed: isPassed, status: candidate.status });
    syncCandidateToCloud(candidate);

    console.log(`   ✅ Candidate record updated to ${candidate.status} and synced to Cloud!`);
    console.log(`===============================================================\n`);

    res.json({
      success: true,
      passed: isPassed,
      score: scorePercentage,
      correctCount,
      totalCount,
      candidateName: candidate.name,
      appliedRole: candidate.role,
      interviewDate: candidate.interviewDate,
      interviewTime: candidate.interviewTime,
      meetingLink: candidate.meetingLink,
      emailSent: emailSentResult ? emailSentResult.success : false,
      message: isPassed
        ? `Congratulations! You scored ${scorePercentage}% and passed the assessment. Your official Final Interview Round Invitation has been dispatched!`
        : `Assessment submitted. Your score is ${scorePercentage}%. An outcome email has been dispatched.`
    });
  } catch (err) {
    console.error("Test submission error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. KPI Analytics & Stats (Supports both /api/analytics and /api/stats)
function getAnalyticsStats(req, res) {
  const list = getCandidates();
  const total = list.length;
  const selected = list.filter(c => c.decision === 'SELECTED').length;
  const rejected = list.filter(c => c.decision === 'REJECTED').length;
  const hired = list.filter(c => c.status === 'HIRED').length;
  const testAssigned = list.filter(c => c.testStatus === 'ASSIGNED' || c.status === 'TEST_ASSIGNED').length;
  const testCompleted = list.filter(c => c.testStatus === 'COMPLETED').length;
  const testPassed = list.filter(c => c.testScore !== undefined && c.testScore >= 80).length;
  const testFailed = list.filter(c => c.testScore !== undefined && c.testScore < 80).length;

  const totalScore = list.reduce((acc, c) => acc + (Number(c.matchScore) || 0), 0);
  const avgScore = total > 0 ? Math.round(totalScore / total) : 0;
  const selectionRate = total > 0 ? Math.round((selected / total) * 100) : 0;
  const hiringRate = total > 0 ? Math.round((hired / total) * 100) : 0;

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
    hired,
    testAssigned,
    testCompleted,
    testPassed,
    testFailed,
    avgScore,
    selectionRate,
    hiringRate,
    topSkills,
    roleDistribution: roleMap
  });
}

app.get('/api/analytics', getAnalyticsStats);
app.get('/api/stats', getAnalyticsStats);

// 9. Manual Email Dispatch & Resend
app.post('/api/send-email', async (req, res) => {
  try {
    const { candidateId, toEmail, subject, body, html } = req.body;
    if (!toEmail || !subject || (!body && !html)) {
      return res.status(400).json({ success: false, error: 'Missing required email parameters' });
    }
    const result = html 
      ? await sendCandidateCustomEmail(toEmail, subject, html, body || '')
      : await sendCandidateEmail(toEmail, subject, body);

    if (candidateId) {
      let candidates = getCandidates();
      const cand = candidates.find(c => c.id === candidateId);
      if (cand) {
        if (result.success) {
          cand.emailMessageId = result.messageId;
          cand.emailSentAt = new Date().toISOString();
          cand.emailDeliveryStatus = 'DELIVERED';
          cand.emailTransport = result.transport || 'direct';
          removeFailedEmail(cand.id, toEmail);
        } else {
          cand.emailDeliveryStatus = 'FAILED';
          cand.emailDeliveryError = result.error;
          queueFailedEmail({
            candidateId: cand.id,
            toEmail,
            subject,
            html: html || null,
            body: body || ''
          });
        }
        saveCandidates(candidates);
      }
    }

    res.json({ success: result.success, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resend Email for a specific Candidate by ID
app.post('/api/candidates/:id/resend-email', async (req, res) => {
  try {
    const candidates = getCandidates();
    const cand = candidates.find(c => c.id === req.params.id);
    if (!cand) {
      return res.status(404).json({ success: false, error: 'Candidate not found' });
    }

    const toEmail = cand.email;
    const subject = cand.emailSubject || `Application Update: ${cand.role}`;
    let htmlContent = '';
    
    if (cand.decision === 'SELECTED') {
      htmlContent = generateInterviewInviteTemplate({ candidate: cand });
    } else {
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 620px; line-height: 1.6; color: #333; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h3 style="color: #6366f1; margin-top: 0;">${appConfig.companyName} — Application Status</h3>
          <p style="white-space: pre-line;">${cand.emailBody || 'Thank you for your application.'}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="font-size: 12px; color: #64748b;">
            Processed and dispatched by our HR Automation System.<br>
            Recruiter Contact: <strong>${appConfig.hrEmail}</strong>
          </p>
        </div>
      `;
    }

    const result = await sendCandidateCustomEmail(toEmail, subject, htmlContent, cand.emailBody || '');
    if (result.success) {
      cand.emailMessageId = result.messageId;
      cand.emailSentAt = new Date().toISOString();
      cand.emailDeliveryStatus = 'DELIVERED';
      cand.emailTransport = result.transport || 'resend';
      removeFailedEmail(cand.id, toEmail);
      saveCandidates(candidates);
      return res.json({ success: true, message: `Email dispatched to ${toEmail}`, messageId: result.messageId });
    } else {
      cand.emailDeliveryStatus = 'FAILED';
      cand.emailDeliveryError = result.error;
      queueFailedEmail({
        candidateId: cand.id,
        toEmail,
        subject,
        html: htmlContent,
        body: cand.emailBody || ''
      });
      saveCandidates(candidates);
      return res.status(500).json({ success: false, error: result.error, portBlocked: result.portBlocked });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// View Failed Email Queue
app.get('/api/failed-emails', (req, res) => {
  const failed = getFailedEmails();
  res.json({ success: true, count: failed.length, failedEmails: failed });
});

// Retry all failed emails
app.post('/api/retry-failed-emails', async (req, res) => {
  const failed = getFailedEmails();
  if (failed.length === 0) {
    return res.json({ success: true, message: "Queue is empty. No failed emails to retry.", retriedCount: 0 });
  }

  let successCount = 0;
  let failedCount = 0;
  const candidates = getCandidates();

  for (const item of [...failed]) {
    try {
      const result = item.html 
        ? await sendCandidateCustomEmail(item.toEmail, item.subject, item.html, item.body || '')
        : await sendCandidateEmail(item.toEmail, item.subject, item.body);

      if (result.success) {
        successCount++;
        removeFailedEmail(item.candidateId, item.toEmail);
        if (item.candidateId) {
          const cand = candidates.find(c => c.id === item.candidateId);
          if (cand) {
            cand.emailMessageId = result.messageId;
            cand.emailSentAt = new Date().toISOString();
            cand.emailDeliveryStatus = 'DELIVERED';
            cand.emailTransport = result.transport || 'retry';
          }
        }
      } else {
        failedCount++;
      }
    } catch (e) {
      failedCount++;
    }
  }

  saveCandidates(candidates);
  res.json({
    success: true,
    message: `Batch retry finished: ${successCount} sent successfully, ${failedCount} still failed.`,
    successCount,
    failedCount,
    remainingInQueue: getFailedEmails().length
  });
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
  res.json({
    success: true,
    config: {
      ...appConfig,
      emailRelayConfigured: Boolean(appConfig.emailRelayUrl),
      resendConfigured: Boolean(appConfig.resendApiKey),
      gmailConfigured: Boolean(appConfig.gmailAppPassword)
    }
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    companyName: appConfig.companyName,
    hrEmail: appConfig.hrEmail,
    selectionScoreThreshold: appConfig.selectionScoreThreshold,
    autoSendEmails: appConfig.autoSendEmails,
    models: appConfig.models,
    emailRelayConfigured: Boolean(appConfig.emailRelayUrl),
    resendConfigured: Boolean(appConfig.resendApiKey)
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
    activeRolesCount: getActiveJobRoles().length,
    failedEmailsQueued: getFailedEmails().length,
    emailTransports: {
      httpsRelayConfigured: Boolean(appConfig.emailRelayUrl),
      resendConfigured: Boolean(appConfig.resendApiKey),
      directSmtpConfigured: Boolean(appConfig.gmailAppPassword)
    }
  });
});

app.post('/api/settings', (req, res) => {
  const {
    geminiApiKey,
    gmailAppPassword,
    hrEmail,
    selectionScoreThreshold,
    autoSendEmails,
    companyName,
    emailRelayUrl,
    resendApiKey
  } = req.body;

  if (geminiApiKey) appConfig.geminiApiKey = geminiApiKey.trim();
  if (gmailAppPassword !== undefined) appConfig.gmailAppPassword = gmailAppPassword.trim();
  if (hrEmail) appConfig.hrEmail = hrEmail.trim();
  if (selectionScoreThreshold !== undefined) appConfig.selectionScoreThreshold = Number(selectionScoreThreshold);
  if (autoSendEmails !== undefined) appConfig.autoSendEmails = Boolean(autoSendEmails);
  if (companyName) appConfig.companyName = companyName.trim();
  if (emailRelayUrl !== undefined) appConfig.emailRelayUrl = emailRelayUrl.trim();
  if (resendApiKey !== undefined) appConfig.resendApiKey = resendApiKey.trim();

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

// Start Server and Automated Background Loop with Port Conflict Resiliency
function startServer(portToUse = PORT, maxRetries = 5) {
  const currentPort = Number(portToUse) || 3000;
  const srv = app.listen(currentPort, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` 🚀 NEXUS HR REAL-TIME SERVER ACTIVE (PORT ${currentPort})`);
    console.log(` 🌐 Dashboard: http://localhost:${currentPort}`);
    console.log(` 📧 Watching:  ${appConfig.hrEmail}`);
    console.log(` ⏱️ Frequency: Every 10 Seconds (Continuous Automated Scan)`);
    console.log(` 🎯 Filter:    STRICT (.pdf / .docx / .doc Resumes ONLY)`);
    console.log(` 🤖 AI Models: ${appConfig.models.join(' ➔ ')}`);
    console.log(`=======================================================`);

    // Initial Scan on startup
    scanInboxNow();

    // Initial Full Sync to Cloud
    setTimeout(syncAllCandidatesToCloud, 1500);

    // Run automated scan every 10 seconds continuously
    setInterval(scanInboxNow, 10000);

    // Run retry queue flusher every 60 seconds
    setInterval(async () => {
      const failed = getFailedEmails();
      if (failed.length > 0) {
        console.log(`🔄 [Retry Queue] Attempting to flush ${failed.length} queued email(s)...`);
        for (const item of [...failed]) {
          try {
            const res = item.html 
              ? await sendCandidateCustomEmail(item.toEmail, item.subject, item.html, item.body || '')
              : await sendCandidateEmail(item.toEmail, item.subject, item.body);
            if (res && res.success) {
              removeFailedEmail(item.candidateId, item.toEmail);
              if (item.candidateId) {
                let candidates = getCandidates();
                const cand = candidates.find(c => c.id === item.candidateId);
                if (cand) {
                  cand.emailMessageId = res.messageId;
                  cand.emailSentAt = new Date().toISOString();
                  cand.emailDeliveryStatus = 'DELIVERED';
                  cand.emailTransport = res.transport || 'retry';
                  saveCandidates(candidates);
                }
              }
            }
          } catch (e) {}
        }
      }
    }, 60000);

    // Keep-alive self-ping every 9 minutes to prevent Render Free container sleep
    if (process.env.RENDER || process.env.PORT === '10000' || process.env.NODE_ENV === 'production') {
      const pingUrl = process.env.RENDER_EXTERNAL_URL || 'https://nexus-hr-workflow.onrender.com';
      setInterval(() => {
        try {
          https.get(`${pingUrl}/api/health`, (res) => {
            console.log(`⏱️ [Keep-Alive Ping] Sent to ${pingUrl}/api/health (Status: ${res.statusCode})`);
          }).on('error', (e) => {
            console.warn(`⏱️ [Keep-Alive Notice]: ${e.message}`);
          });
        } catch (e) {}
      }, 9 * 60 * 1000);
    }
  });

  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxRetries > 0) {
      const nextPort = currentPort + 1;
      console.warn(`⚠️ Port ${currentPort} is currently occupied by another process. Auto-retrying on fallback port ${nextPort}...`);
      startServer(nextPort, maxRetries - 1);
    } else {
      console.error(`❌ Server listen error:`, err.message);
    }
  });

  return srv;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  appConfig,
  getJobRoles,
  saveJobRoles,
  getActiveJobRoles,
  getCandidates,
  saveCandidates,
  optimizeAndRandomizeMCQs,
  generateAntiPatternAnswerKey,
  buildRolePromptInstructions,
  heuristicFallbackEvaluation,
  validateAndSanitizeInterviewDate,
  getFormattedInterviewDate,
  getFormattedJoiningDate,
  shouldIgnoreSender,
  extractTextFromDoc,
  generateTestQuestionsForCandidate,
  startServer
};
