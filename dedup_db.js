const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'candidates_db.json');
let candidates = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Deduplicate by name and email (keep the latest record)
const seen = new Set();
const uniqueCandidates = [];

for (const c of candidates) {
  const key = `${c.name.trim().toLowerCase()}__${c.email.trim().toLowerCase()}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueCandidates.push(c);
  }
}

fs.writeFileSync(dbPath, JSON.stringify(uniqueCandidates, null, 2), 'utf8');
console.log(`Deduplicated candidates: ${uniqueCandidates.length} unique candidates remaining.`);
