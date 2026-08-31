# Tech Innovations Inc. — Official Static Corporate Website

A complete, modern, responsive static corporate website for **Tech Innovations Inc.** (Cybersecurity & IT Solutions company based in Khandwa, Madhya Pradesh, India), featuring a real-time **Careers Portal** connected to the company's automated AI HR Recruitment Workflow.

---

## 🌟 Key Highlights & Features

1. **Cybersecurity-Inspired Aesthetics**:
   - Deep cyber dark theme (`#070a13`), electric cyan (`#06b6d4`), neon blue (`#3b82f6`), and emerald accents.
   - Glassmorphism panels, glowing borders, circuit accents, and responsive layout.
2. **100% Static & Lightweight**:
   - Built exclusively with **HTML5**, **CSS3**, **Vanilla JavaScript**, and **Tailwind CSS (via CDN)**.
   - No build steps, no Node.js/PHP runtime required for the website itself — open `index.html` directly in any web browser!
3. **Live HR Recruitment Workflow Integration (`careers.html`)**:
   - **Dynamic Role Synchronization**: Fetches live active job openings from the HR workflow API (`https://nexus-hr-workflow.onrender.com/api/job-roles`).
   - **Interactive Apply Modal**: Candidates can submit their application directly to `POST /api/evaluate-resume`, immediately registering on the HR Recruitment Dashboard with automated Gemini AI evaluation and email dispatch!
   - **Direct Mailbox Trigger**: Displays the HR recruiter email (`manasvipaliwal317@gmail.com`) for candidates submitting resumes by email to trigger the automated mailbox scanner.
4. **Complete Multi-Page Structure**:
   - `index.html` — Homepage with animated hero, statistics, services preview, and process flow.
   - `about.html` — Mission, Vision, and 4 Core Strategic Pillars.
   - `services.html` — 10 Comprehensive Cybersecurity Disciplines.
   - `solutions.html` — 6 Enterprise Solution Areas and Assurance Pipeline.
   - `industries.html` — Defense models for 9 Key Industry Sectors.
   - `why-us.html` — 6 Pillars of Excellence and 6-Step Implementation Lifecycle.
   - `careers.html` — Real-time Job Openings and Online Application Portal.
   - `contact.html` — Security Consultation Request form with frontend validation.
   - `privacy-policy.html` — Comprehensive Privacy Policy.
   - `terms.html` — Terms of Use.
   - `404.html` — Custom Cybersecurity 404 Error Page.

---

## 📁 Folder Structure

```
tech-innovations-inc/
├── index.html
├── about.html
├── services.html
├── solutions.html
├── industries.html
├── why-us.html
├── careers.html
├── contact.html
├── privacy-policy.html
├── terms.html
├── 404.html
│
├── css/
│   └── style.css
│
├── js/
│   └── main.js
│
├── README.md
└── render.yaml
```

---

## 💻 How to Run Locally

You can run the static site locally using any of the following methods:

### Option 1: Direct File Open
Double click `index.html` in your file explorer to open it in Chrome, Edge, Firefox, or Safari.

### Option 2: Using Any Lightweight HTTP Server
```bash
# Python 3
cd "tech-innovations-inc"
python -m http.server 8080

# Or Node.js npx serve
npx serve .
```
Open `http://localhost:8080` in your browser.

---

## 🚀 How to Deploy on Render (Static Site)

1. **Create a New Static Site on Render**:
   - Navigate to [https://dashboard.render.com/new](https://dashboard.render.com/new).
   - Choose **Static Site**.
2. **Connect your GitHub Repository**:
   - Select `manasvipaliwal317-arch/HR-WORKFLOW`.
3. **Configure Settings**:
   - **Name**: `tech-innovations-inc`
   - **Branch**: `main`
   - **Root Directory**: `tech-innovations-inc`
   - **Build Command**: *(leave empty)*
   - **Publish Directory**: `.`
4. **Deploy**:
   - Click **Create Static Site**.
   - Your website will be live in seconds at `https://tech-innovations-inc.onrender.com`!

---

## 🔗 Separate URLs for Workflow vs Website

- 🛠️ **HR Recruitment & AI Workflow**: `https://nexus-hr-workflow.onrender.com`
- 🌐 **Corporate Static Website**: `https://tech-innovations-inc.onrender.com`

---

## 📝 Placeholder Content Notice
The following information is currently placeholder content and should be customized with your final production details:
- Contact email: `info@techinnovations.example`
- Phone number: `+91 XXXXX XXXXX`
