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

imap.once('ready', () => {
  imap.getBoxes((err, boxes) => {
    if (err) throw err;
    console.log('Available Mailboxes:', Object.keys(boxes));
    if (boxes['[Gmail]']) {
      console.log('[Gmail] sub-boxes:', Object.keys(boxes['[Gmail]'].children));
    }

    // Check [Gmail]/All Mail
    const targetBox = '[Gmail]/All Mail';
    imap.openBox(targetBox, true, (err, box) => {
      if (err) {
        console.error(`Cannot open ${targetBox}:`, err.message);
        imap.end();
        return;
      }
      console.log(`\nOpened ${targetBox}. Total: ${box.messages.total}`);
      const startSeq = Math.max(1, box.messages.total - 10);
      const endSeq = box.messages.total;
      console.log(`Fetching ${targetBox} messages from ${startSeq} to ${endSeq}...`);

      const f = imap.seq.fetch(`${startSeq}:${endSeq}`, { bodies: '', struct: true });
      f.on('message', (msg, seqno) => {
        let buffer = '';
        msg.on('body', (stream) => {
          stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
        });
        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(buffer);
            console.log(`\nSeq ${seqno} | Date: ${parsed.date}`);
            console.log(`From: ${parsed.from ? parsed.from.text : 'Unknown'}`);
            console.log(`Subject: ${parsed.subject}`);
            console.log(`Attachments: ${parsed.attachments ? parsed.attachments.length : 0} (${(parsed.attachments || []).map(a => a.filename).join(', ')})`);
            console.log(`Snippet: ${(parsed.text || '').slice(0, 150)}...`);
          } catch(e) {}
        });
      });
      f.once('end', () => {
        setTimeout(() => imap.end(), 2000);
      });
    });
  });
});

imap.connect();
