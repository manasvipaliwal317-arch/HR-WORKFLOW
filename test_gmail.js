const nodemailer = require('nodemailer');

const user = 'manasvipaliwal317@gmail.com';
const pass = 'YOUR_GMAIL_APP_PASSWORD';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: user,
    pass: pass
  }
});

async function verifyConnection() {
  console.log('Testing Gmail SMTP Connection for ' + user + '...');
  try {
    const success = await transporter.verify();
    console.log('✅ SMTP Connection & Authentication SUCCESSFUL!', success);
  } catch (err) {
    console.error('❌ SMTP Connection FAILED:', err.message);
  }
}

verifyConnection();
