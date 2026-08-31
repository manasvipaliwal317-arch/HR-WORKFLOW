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
  imap.openBox('INBOX', true, (err, box) => {
    if (err) throw err;
    console.log(`Total messages in INBOX: ${box.messages.total}`);
    
    // Fetch last 40 messages
    const startSeq = Math.max(1, box.messages.total - 40);
    const endSeq = box.messages.total;
    console.log(`Searching messages from ${startSeq} to ${endSeq}...`);

    const f = imap.seq.fetch(`${startSeq}:${endSeq}`, {
      bodies: '',
      struct: true
    });

    const candidateMatches = [];

    f.on('message', (msg, seqno) => {
      let buffer = '';
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
      });

      msg.once('end', async () => {
        try {
          const parsed = await simpleParser(buffer);
          const subj = (parsed.subject || '').toLowerCase();
          const body = (parsed.text || '').toLowerCase();
          const from = parsed.from ? parsed.from.text : '';
          const hasAtt = parsed.attachments && parsed.attachments.length > 0;

          // Check if this looks like a job application
          const isJobApp = subj.includes('resume') || 
                           subj.includes('application') || 
                           subj.includes('cv') || 
                           subj.includes('job') || 
                           subj.includes('developer') || 
                           subj.includes('engineer') ||
                           body.includes('resume') ||
                           body.includes('application') ||
                           hasAtt;

          if (isJobApp && !from.includes('Google') && !from.includes('LinkedIn') && !from.includes('BSE ALERTS') && !from.includes('Canva')) {
            candidateMatches.push({
              seqno,
              from: parsed.from ? parsed.from.text : 'Unknown',
              fromEmail: (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0].address : from,
              subject: parsed.subject,
              date: parsed.date,
              text: parsed.text || '',
              attachments: parsed.attachments || []
            });
          }
        } catch (e) {
          console.error(`Error msg ${seqno}:`, e.message);
        }
      });
    });

    f.once('end', () => {
      console.log(`\nFound ${candidateMatches.length} potential candidate application emails:`);
      candidateMatches.forEach((c, idx) => {
        console.log(`\n--------------------------------------------`);
        console.log(`[MATCH #${idx + 1}] Seq: ${c.seqno}`);
        console.log(`From:        ${c.from} (${c.fromEmail})`);
        console.log(`Subject:     ${c.subject}`);
        console.log(`Date:        ${c.date}`);
        console.log(`Attachments: ${c.attachments.length} -> ${c.attachments.map(a => `${a.filename} (${a.size} bytes)`).join(', ')}`);
        console.log(`Body:        ${c.text.slice(0, 300)}...`);
      });
      imap.end();
    });
  });
});

imap.connect();
