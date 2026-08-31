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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/site', express.static(path.join(__dirname, 'tech-innovations-inc')));
app.use('/company', express.static(path.join(__dirname, 'tech-innovations-inc')));

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
  const { instructions: roleInstructions, activeRoles, roleNames } = buildRolePromptInstructions();

  const systemInstruction = `
You are an expert Senior Technical Recruiter & Hiring Director for ${appConfig.hrEmail} at ${appConfig.companyName}.
Carefully analyze the candidate's resume content, skills, experience, and application details.

${roleInstructions}

Candidate Target / Preferred Hint: "${appliedRole || 'Auto-Detect Best Active Open Role'}"

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
  "proposedInterviewDate": "Suggested upcoming date",
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

// Helper: Generate persistent, clean Google Meet URL
function generateGoogleMeetLink(seed = '') {
  const chars = (seed ? seed.toString().toLowerCase().replace(/[^a-z0-9]/g, '') : '') + Math.random().toString(36).substring(2, 11);
  const clean = chars.padEnd(10, 'x').substring(0, 10);
  return `https://meet.google.com/${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 10)}`;
}

// Helper: Formatted upcoming interview date string
function getFormattedInterviewDate(daysAhead = 3) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  // Skip weekends if falls on Saturday/Sunday
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString('en-US', options);
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
function generateHiringOfferTemplate({ candidate, joiningDate, salaryOffer, customNotes }) {
  const candidateName = candidate.name || 'Candidate';
  const role = candidate.role || 'Full Stack Developer';
  const startDate = joiningDate || candidate.joiningDate || 'Within 2-4 weeks (To be mutually confirmed)';
  const compDetails = salaryOffer || candidate.salaryOffer || 'Competitive Compensation Package (As finalized during interview)';

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
                    📋 Offer Summary & Next Steps
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
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Target Start Date:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b; font-weight: 600;">${startDate}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 14px; color: #047857;"><strong>Compensation:</strong></td>
                      <td style="padding: 6px 0; font-size: 14px; color: #064e3b;">${compDetails}</td>
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

  const targetEmail = evaluation.candidateEmail || fromAddr;
  const now = new Date().toISOString();
  const candId = 'cand_auto_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const meetingLink = generateGoogleMeetLink(candId);
  const matchedRole = evaluation.appliedRole || appliedRole;
  const interviewDate = evaluation.proposedInterviewDate || getFormattedInterviewDate(3);
  const interviewTime = '2:30 PM - 3:15 PM IST (45 Minutes)';
  const interviewRound = (matchedRole.toLowerCase().includes('marketing'))
    ? 'Round 1: Marketing Strategy & Portfolio Review'
    : 'Round 1: Technical & System Architecture Deep-Dive';
  const interviewerName = `${appConfig.companyName} Technical Hiring Panel`;

  const candidateRecord = {
    id: candId,
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
    proposedInterviewDate: interviewDate,
    interviewDate: interviewDate,
    interviewTime: interviewTime,
    interviewRound: interviewRound,
    meetingLink: meetingLink,
    interviewerName: interviewerName,
    interviewStatus: evaluation.decision === 'SELECTED' ? `Interview Invitation Dispatched (${meetingLink})` : 'N/A',
    emailSubject: evaluation.decision === 'SELECTED' 
      ? `📅 Interview Invitation: ${evaluation.appliedRole || appliedRole} at ${appConfig.companyName}` 
      : evaluation.emailSubject,
    emailBody: evaluation.emailBody,
    emailSentAt: now,
    createdAt: now,
    updatedAt: now,
    source: `Gmail IMAP (${fileName})`
  };

  // Dispatch Email
  if (appConfig.autoSendEmails && targetEmail && targetEmail.includes('@')) {
    if (evaluation.decision === 'SELECTED') {
      const inviteHtml = generateInterviewInviteTemplate({ candidate: candidateRecord });
      await sendCandidateCustomEmail(targetEmail, candidateRecord.emailSubject, inviteHtml, evaluation.emailBody);
    } else {
      await sendCandidateEmail(targetEmail, candidateRecord.emailSubject, evaluation.emailBody);
    }
  }

  // Save Candidate
  let candidates = getCandidates();
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
    const candId = 'cand_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const meetingLink = generateGoogleMeetLink(candId);
    const targetRole = appliedRole || evaluation.appliedRole || 'Full Stack Developer';
    const interviewDate = evaluation.proposedInterviewDate || getFormattedInterviewDate(3);
    const interviewTime = '2:30 PM - 3:15 PM IST (45 Minutes)';
    const interviewRound = (targetRole === 'Digital Marketing Specialist')
      ? 'Round 1: Marketing Strategy & Campaign Review'
      : 'Round 1: Technical & System Architecture Deep-Dive';
    const interviewerName = `${appConfig.companyName} Technical Hiring Panel`;

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
      interviewRound: interviewRound,
      meetingLink: meetingLink,
      interviewerName: interviewerName,
      interviewStatus: evaluation.decision === 'SELECTED' ? `Interview Invitation Dispatched (${meetingLink})` : 'N/A',
      emailSubject: evaluation.decision === 'SELECTED' 
        ? `📅 Interview Invitation: ${targetRole} at ${appConfig.companyName}` 
        : (evaluation.emailSubject || `Application Update: ${targetRole}`),
      emailBody: evaluation.emailBody,
      emailSentAt: now,
      createdAt: now,
      updatedAt: now,
      source: fileName === 'Direct Submission' ? 'Dashboard Submission' : `File Upload (${fileName})`
    };

    if (candidateEmail && candidateEmail.includes('@') && appConfig.autoSendEmails) {
      if (evaluation.decision === 'SELECTED') {
        const inviteHtml = generateInterviewInviteTemplate({ candidate: candidateRecord });
        await sendCandidateCustomEmail(candidateEmail, candidateRecord.emailSubject, inviteHtml, evaluation.emailBody);
      } else {
        await sendCandidateEmail(candidateEmail, candidateRecord.emailSubject, evaluation.emailBody);
      }
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
    if (phone) candidate.phone = phone;
    if (role) candidate.role = role;
    if (status) candidate.status = status;
    if (decision) candidate.decision = decision;
    if (matchScore !== undefined) candidate.matchScore = Number(matchScore);
    if (interviewDate || proposedInterviewDate) candidate.proposedInterviewDate = interviewDate || proposedInterviewDate;
    if (interviewDate) candidate.interviewDate = interviewDate;
    if (interviewTime) candidate.interviewTime = interviewTime;
    if (meetingLink) candidate.meetingLink = meetingLink;
    if (interviewerName) candidate.interviewerName = interviewerName;
    if (interviewRound) candidate.interviewRound = interviewRound;
    if (interviewStatus) candidate.interviewStatus = interviewStatus;
    if (hrNotes !== undefined) candidate.hrNotes = hrNotes;
    if (joiningDate) candidate.joiningDate = joiningDate;
    if (salaryOffer) candidate.salaryOffer = salaryOffer;

    candidate.updatedAt = new Date().toISOString();

    let emailSentResult = null;

    // 🎯 AUTOMATION 1: If marked as HIRED (or OFFER_EXTENDED), automatically dispatch formal Job Offer Email!
    if (status === 'HIRED' || (status === 'OFFER_EXTENDED' && prevStatus !== 'OFFER_EXTENDED') || (status === 'HIRED' && prevStatus !== 'HIRED')) {
      candidate.decision = 'SELECTED';
      candidate.interviewStatus = '🎉 Official Job Offer Dispatched';
      
      const offerSubject = customEmailSubject || `🎉 Congratulations! Job Offer for ${candidate.role} at ${appConfig.companyName}`;
      const offerHtml = generateHiringOfferTemplate({
        candidate,
        joiningDate: joiningDate || candidate.joiningDate || 'Within 2-4 weeks',
        salaryOffer: salaryOffer || candidate.salaryOffer || 'As discussed during the final interview round',
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

  // Run automated scan every 5 seconds continuously
  setInterval(scanInboxNow, 5000);
});
