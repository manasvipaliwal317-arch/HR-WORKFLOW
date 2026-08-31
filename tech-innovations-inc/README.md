# Tech Innovations Inc. — Corporate Cybersecurity Website

A modern, high-performance, responsive static corporate website built for **Tech Innovations Inc.** (Cybersecurity & IT Solutions, based in Khandwa, Madhya Pradesh, India).

The website includes a live-integrated **Careers & Openings** page (`careers.html`) directly connected to the **Nexus HR Automated Recruitment Workflow** to fetch live active job openings, requirements, and streamline applicant intake.

---

## 🛡️ Project Overview

- **Company Name**: Tech Innovations Inc.
- **Industry**: Cybersecurity & IT Security Solutions
- **Location**: Khandwa, Madhya Pradesh, India
- **Website Type**: Multi-Page Responsive Static Corporate Website
- **Aesthetic**: Premium Dark Cybersecurity Theme (Deep navy/black `#070b14`, electric cyan `#00f0ff`, sky blue `#38bdf8`, glassmorphism, glowing micro-animations, interactive cyber particle canvas)
- **Zero Heavy Dependencies**: Pure HTML5, CSS3, Tailwind CSS (via CDN), and Vanilla JavaScript. Works immediately by opening files directly in any browser.

---

## ⚡ Live HR Recruitment Workflow Integration

The **Careers Page (`careers.html`)** connects directly to the backend HR Workflow API:
- **Production Endpoint**: `https://nexus-hr-workflow.onrender.com/api/job-roles`
- **Local Fallback Endpoint**: `http://localhost:3000/api/job-roles`
- **Dynamic Synchronization**: When the HR manager adds, edits, or activates job positions on the HR Dashboard, the website's Careers page automatically updates its listings, required skill tags, and experience thresholds.
- **Direct Mailto Action**: Each job card generates a 1-click `mailto:manasvipaliwal317@gmail.com` link pre-populated with the exact job title in the subject line, routing resumes directly into the automated AI screening and interview scheduling pipeline.

---

## 📁 Folder Structure

```text
tech-innovations-inc/
├── index.html              # Homepage with cyber hero, live stats & service highlights
├── about.html              # Company background, Mission & Vision, Core Principles
├── services.html           # 10 comprehensive cybersecurity services
├── solutions.html          # 6 enterprise solution areas & 6-step defense pipeline
├── industries.html         # 9 targeted industry sectors (SMBs, Healthcare, Fintech, etc.)
├── why-us.html             # 6 value pillars & vendor comparison matrix
├── careers.html            # Dynamic job openings synced with HR workflow & direct apply
├── contact.html            # Consultation inquiry form with client-side validation
├── privacy-policy.html     # Static privacy policy
├── terms.html              # Terms of use
├── 404.html                # Custom cyber-themed 404 page
│
├── css/
│   └── style.css           # Custom cyber glow, grid patterns, glassmorphism & animations
│
├── js/
│   └── main.js             # Sticky header, mobile nav, particle canvas, dynamic careers feed
│
├── render.yaml             # Render Static Site deployment blueprint
└── README.md               # Project documentation
```

---

## 🚀 How to Run Locally

### Option 1: Direct File Open
Simply double-click `index.html` (or right-click and choose **Open with Chrome / Edge / Firefox**).

### Option 2: Local HTTP Server
Using `npx serve` or Python's built-in HTTP server:
```bash
# In the tech-innovations-inc directory:
npx serve .
# Or using Python 3:
python -m http.server 8080
```
Then visit `http://localhost:8080` in your web browser.

---

## ☁️ How to Deploy on Render (Static Site)

1. **Push to GitHub**: Ensure the `tech-innovations-inc` directory or repository is pushed to your GitHub account (e.g. `manasvipaliwal317-arch/HR-WORKFLOW`).
2. **Go to Render Dashboard**: [https://dashboard.render.com/new](https://dashboard.render.com/new)
3. **Select "Static Site"**:
   - **Name**: `tech-innovations-inc`
   - **Branch**: `main`
   - **Root Directory**: `tech-innovations-inc` (or `.` if repo root)
   - **Build Command**: *(leave empty)*
   - **Publish Directory**: `.` (or `tech-innovations-inc`)
4. **Deploy**: Click **Create Static Site**. Render will provision a live HTTPS URL (e.g., `https://tech-innovations-inc.onrender.com`).

---

## 📝 Placeholder Information Note

The following business contact details are currently template placeholders and can be updated as needed:
- **Corporate Inquiry Email**: `info@techinnovations.example` (Recruitment email is actively mapped to `manasvipaliwal317@gmail.com`)
- **Phone Number**: `+91 XXXXX XXXXX`
- **Office Address**: Khandwa, Madhya Pradesh, India
