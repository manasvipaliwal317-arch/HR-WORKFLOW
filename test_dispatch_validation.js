const http = require('http');
const https = require('https');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  hrEmail: 'manasvipaliwal317@gmail.com',
  appPassword: 'kstnydybbuqmpbyr',
  testRecipient: 'paliwalrishu2000@gmail.com',
  apiUrl: 'http://localhost:3000'
};

async function testSmtpDispatch() {
  console.log('1. Testing Gmail SMTP Transport & Direct Auto-Dispatch...');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: CONFIG.hrEmail,
      pass: CONFIG.appPassword
    }
  });

  const testSubject = `Automated Pipeline Verification - ${new Date().toISOString()}`;
  const testHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #6366f1; border-radius: 10px;">
      <h2 style="color: #6366f1;">Tech Innovations Inc. — Automation Verification</h2>
      <p>This is a verified test email dispatched automatically by the HR Recruitment Engine.</p>
      <p>Timestamp: <strong>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST</strong></p>
      <hr>
      <p style="font-size: 12px; color: #64748b;">Recruiter Mailbox: ${CONFIG.hrEmail}</p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: `"Tech Innovations Inc. Recruitment Team" <${CONFIG.hrEmail}>`,
    to: CONFIG.testRecipient,
    subject: testSubject,
    html: testHtml
  });

  console.log(`   ✅ Direct SMTP Dispatch Succeeded! Message ID: ${info.messageId}`);
  return info.messageId;
}

async function testDashboardApi() {
  console.log('\n2. Testing Dashboard API & Real-time Scanner Status...');
  const res = await new Promise((resolve, reject) => {
    http.get(`${CONFIG.apiUrl}/api/scanner-status`, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });

  console.log(`   ✅ Scanner Telemetry:`, res.stats);
}

async function testCandidateEvaluationApi() {
  console.log('\n3. Testing End-to-End Candidate Submission & Auto-Dispatch via API...');
  const testCandidate = {
    candidateName: "Kavya Mehra",
    candidateEmail: CONFIG.testRecipient,
    appliedRole: "Full Stack Developer",
    resumeTextInput: `Kavya Mehra - Senior Full Stack Developer.
Email: ${CONFIG.testRecipient}
Experience: 4 years of hands-on experience building enterprise web apps using React, Node.js, Express, PostgreSQL, TypeScript, and Docker.
Key achievements: Built high-throughput microservices handling 50k rpm with 99.99% uptime. Optimized database query performance by 40%.`
  };

  const payload = JSON.stringify(testCandidate);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/evaluate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  console.log(`   🎯 Decision: ${res.candidate.name} -> ${res.candidate.decision} (${res.candidate.matchScore}%)`);
  console.log(`   📅 Proposed Interview: ${res.candidate.proposedInterviewDate}`);
  console.log(`   📧 Status: ${res.candidate.status}`);
  console.log(`   ✉️ Email Subject: ${res.candidate.emailSubject}`);
  console.log(`   ✅ Candidate saved with ID: ${res.candidate.id}`);
}

async function main() {
  console.log('===============================================================');
  console.log(' 🚀 RUNNING FULL END-TO-END AUTOMATIC DISPATCH VERIFICATION');
  console.log('===============================================================\n');

  try {
    await testSmtpDispatch();
    await testDashboardApi();
    await testCandidateEvaluationApi();

    console.log('\n===============================================================');
    console.log(' ✨ ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ✨');
    console.log(' Emails are dispatching automatically and live monitoring is active.');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('❌ Verification Error:', err);
  }
}

main();
