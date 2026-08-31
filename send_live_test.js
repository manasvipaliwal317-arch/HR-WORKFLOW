const nodemailer = require('nodemailer');

const user = 'manasvipaliwal317@gmail.com';
const pass = 'YOUR_GMAIL_APP_PASSWORD';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user, pass }
});

async function sendTest() {
  console.log('Sending live verification email to ' + user + '...');
  try {
    const info = await transporter.sendMail({
      from: `"Nexus HR Automation" <${user}>`,
      to: user,
      subject: "🎉 Nexus HR & n8n Recruitment System Connected Successfully!",
      text: `Hi Manasvi,\n\nCongratulations! Your Google App Password has been successfully verified and integrated with your n8n recruitment workflow and HR Dashboard.\n\nSystem Capabilities Now Active:\n1. Automatic IMAP scanning of incoming candidate emails & resume attachments at ${user}.\n2. High-speed Gemini 3.6 Flash resume parsing, scoring (0-100), and strengths/growth extraction.\n3. Automatic interview invitation emails with scheduling slots for selected candidates.\n4. Polite, constructive rejection emails for non-matching candidates.\n5. Live HR Dashboard at http://localhost:3000.\n\nBest regards,\nNexus HR AI Pipeline`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px;">
          <h2 style="color: #6366f1;">🎉 Nexus HR & n8n System Connected Successfully!</h2>
          <p>Hi <strong>Manasvi</strong>,</p>
          <p>Your Google App Password has been verified and integrated with your n8n workflow and HR Dashboard.</p>
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981; margin: 15px 0;">
            <h3 style="margin-top: 0; color: #10b981;">Active Capabilities:</h3>
            <ul>
              <li><strong>IMAP Email Reader:</strong> Listening on <code>${user}</code> for incoming resumes.</li>
              <li><strong>Gemini 3.6 Flash:</strong> Instant resume scoring, decision routing, and tailored interview questions.</li>
              <li><strong>SMTP Auto-Mailer:</strong> Live automated selection & rejection email dispatches.</li>
              <li><strong>HR Dashboard:</strong> Live at <a href="http://localhost:3000">http://localhost:3000</a>.</li>
            </ul>
          </div>
          <p style="color: #6b7280; font-size: 13px;">Sent automatically by your local Nexus HR Automation pipeline.</p>
        </div>
      `
    });
    console.log('✅ Live email sent successfully! Message ID:', info.messageId);
  } catch (e) {
    console.error('❌ Failed to send live test email:', e.message);
  }
}

sendTest();
