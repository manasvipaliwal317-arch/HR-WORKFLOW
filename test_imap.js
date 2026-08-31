const tls = require('tls');

const socket = tls.connect(993, 'imap.gmail.com', { rejectUnauthorized: false }, () => {
  console.log('Connected to imap.gmail.com:993 via TLS');
});

socket.on('data', (data) => {
  const msg = data.toString();
  console.log('IMAP Server:', msg.trim());
  if (msg.includes('* OK')) {
    // Send LOGIN command
    socket.write(`a001 LOGIN manasvipaliwal317@gmail.com kstnydybbuqmpbyr\r\n`);
  } else if (msg.includes('a001 OK')) {
    console.log('✅ IMAP Login SUCCESSFUL! Mailbox is fully accessible.');
    socket.write(`a002 LOGOUT\r\n`);
  } else if (msg.includes('a001 NO') || msg.includes('a001 BAD')) {
    console.log('❌ IMAP Login FAILED:', msg.trim());
    socket.end();
  }
});

socket.on('end', () => {
  console.log('IMAP connection closed.');
});

socket.on('error', (err) => {
  console.error('IMAP Error:', err.message);
});
