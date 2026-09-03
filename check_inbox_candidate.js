const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;

const config = {
  imap: {
    user: 'manasvipaliwal317@gmail.com',
    password: 'YOUR_GMAIL_APP_PASSWORD',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000
  }
};

async function checkRecentEmails() {
  console.log('Connecting to Gmail IMAP to find candidate email...');
  try {
    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    // Search for UNSEEN or recent emails
    console.log('Searching for UNSEEN emails...');
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false,
      struct: true
    };

    let messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`Found ${messages.length} UNSEEN messages.`);

    if (messages.length === 0) {
      console.log('No UNSEEN messages, fetching latest 5 messages in INBOX...');
      // Fetch latest 5 messages
      const allMsgs = await connection.search(['ALL'], { bodies: ['HEADER', ''], struct: true });
      const last5 = allMsgs.slice(-5);
      for (const item of last5) {
        const header = item.parts.find(p => p.which === 'HEADER');
        console.log(`- SeqNo: ${item.attributes.uid} | From: ${header.body.from} | Subject: ${header.body.subject} | Date: ${header.body.date}`);
      }
    } else {
      for (const item of messages.slice(-5)) {
        const all = item.parts.find(p => p.which === '');
        const id = item.attributes.uid;
        if (all) {
          const parsed = await simpleParser(all.body);
          console.log(`\n========================================`);
          console.log(`UID: ${id}`);
          console.log(`From: ${parsed.from ? parsed.from.text : 'Unknown'}`);
          console.log(`To: ${parsed.to ? parsed.to.text : 'Unknown'}`);
          console.log(`Subject: ${parsed.subject}`);
          console.log(`Date: ${parsed.date}`);
          console.log(`Body Snippet: ${(parsed.text || '').slice(0, 200)}...`);
          console.log(`Attachments: ${parsed.attachments ? parsed.attachments.length : 0}`);
          if (parsed.attachments && parsed.attachments.length > 0) {
            parsed.attachments.forEach((att, idx) => {
              console.log(`  Attachment ${idx + 1}: ${att.filename} (${att.contentType}, ${att.size} bytes)`);
            });
          }
        }
      }
    }

    connection.end();
  } catch (err) {
    console.error('Error fetching emails:', err);
  }
}

checkRecentEmails();
