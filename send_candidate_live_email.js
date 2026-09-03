const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const user = 'manasvipaliwal317@gmail.com';
const pass = 'YOUR_GMAIL_APP_PASSWORD';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user, pass }
});

async function sendCandidateApplication() {
  console.log('Sending candidate job application email to ' + user + '...');

  const pdfPath = path.join(__dirname, 'test_resume_sample.pdf');
  const pdfBuffer = fs.readFileSync(pdfPath);

  const mailOptions = {
    from: `"Priya Sharma" <paliwalrishu2000@gmail.com>`,
    to: user,
    replyTo: 'paliwalrishu2000@gmail.com',
    subject: `Application for Digital Marketing Specialist - Priya Sharma`,
    text: `Dear Hiring Team,\n\nI am excited to submit my application for the Digital Marketing Specialist role at Tech Innovations Inc.\n\nI have 4+ years of hands-on experience managing large-scale Google Ads and Meta Ads campaigns (₹15L+ monthly budget), generating 4.5x ROAS, and scaling organic SEO traffic by 80%.\n\nPlease find my resume attached.\n\nBest regards,\nPriya Sharma\nEmail: paliwalrishu2000@gmail.com`,
    attachments: [
      {
        filename: 'Priya_Sharma_Marketing_Resume.pdf',
        content: pdfBuffer
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Candidate Application Email Sent to Gmail Inbox! Message ID: ${info.messageId}`);
    console.log('Now waiting 5-10 seconds for the continuous IMAP scanner to pick it up and auto-dispatch the reply...');
  } catch (err) {
    console.error('Failed to send candidate email:', err);
  }
}

sendCandidateApplication();
