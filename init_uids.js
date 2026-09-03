const Imap = require('imap');
const fs = require('fs');
const path = require('path');

const imap = new Imap({
  user: 'manasvipaliwal317@gmail.com',
  password: 'YOUR_GMAIL_APP_PASSWORD',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

imap.once('ready', () => {
  imap.openBox('[Gmail]/All Mail', true, (err, box) => {
    if (err) throw err;
    const total = box.messages.total;
    const startSeq = Math.max(1, total - 25);
    const uids = [];

    const f = imap.seq.fetch(`${startSeq}:${total}`, { struct: true });
    f.on('message', (msg, seqno) => {
      let uid = seqno.toString();
      msg.on('attributes', (attrs) => {
        if (attrs && attrs.uid) uid = attrs.uid.toString();
      });
      msg.once('end', () => uids.push(uid));
    });

    f.once('end', () => {
      const pFile = path.join(__dirname, 'processed_email_uids.json');
      fs.writeFileSync(pFile, JSON.stringify(uids, null, 2), 'utf8');
      console.log(`Initialized processed_email_uids.json with ${uids.length} latest message IDs.`);
      imap.end();
    });
  });
});

imap.connect();
