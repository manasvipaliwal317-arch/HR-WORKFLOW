const Imap = require('imap');
const { simpleParser } = require('mailparser');

const imap = new Imap({
  user: 'manasvipaliwal317@gmail.com',
  password: 'kstnydybbuqmpbyr',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

function openInbox(cb) {
  imap.openBox('INBOX', true, cb);
}

imap.once('ready', () => {
  console.log('IMAP Connected successfully.');
  openInbox((err, box) => {
    if (err) throw err;
    console.log(`INBOX opened. Total messages: ${box.messages.total}`);
    
    // Fetch the last 15 messages by sequence number
    const startSeq = Math.max(1, box.messages.total - 15);
    const endSeq = box.messages.total;
    console.log(`Fetching messages from seq ${startSeq} to ${endSeq}...`);

    const f = imap.seq.fetch(`${startSeq}:${endSeq}`, {
      bodies: '',
      struct: true
    });

    const parsedMessages = [];

    f.on('message', (msg, seqno) => {
      let buffer = '';
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
      });

      msg.once('end', async () => {
        try {
          const parsed = await simpleParser(buffer);
          parsedMessages.push({
            seqno,
            from: parsed.from ? parsed.from.text : 'Unknown',
            to: parsed.to ? parsed.to.text : 'Unknown',
            subject: parsed.subject,
            date: parsed.date,
            text: parsed.text || '',
            attachments: parsed.attachments || []
          });
        } catch (e) {
          console.error(`Error parsing msg ${seqno}:`, e.message);
        }
      });
    });

    f.once('error', (err) => {
      console.error('Fetch error:', err);
    });

    f.once('end', () => {
      console.log(`Done fetching ${parsedMessages.length} messages.`);
      parsedMessages.sort((a, b) => new Date(b.date) - new Date(a.date));

      console.log(`\n============= LATEST EMAILS IN INBOX =============`);
      parsedMessages.forEach((m, i) => {
        console.log(`\n[#${i + 1}] Seq: ${m.seqno}`);
        console.log(`   From:        ${m.from}`);
        console.log(`   Subject:     ${m.subject}`);
        console.log(`   Date:        ${m.date}`);
        console.log(`   Attachments: ${m.attachments.length} (${m.attachments.map(a => `${a.filename} [${a.contentType}]`).join(', ') || 'None'})`);
        console.log(`   Body:        ${m.text.replace(/\s+/g, ' ').trim().slice(0, 200)}...`);
      });

      imap.end();
    });
  });
});

imap.once('error', (err) => {
  console.error('IMAP Error:', err);
});

imap.once('end', () => {
  console.log('IMAP Connection closed.');
});

imap.connect();
