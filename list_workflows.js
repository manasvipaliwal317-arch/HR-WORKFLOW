const fs = require('fs');
const data = JSON.parse(fs.readFileSync('workflows_backup.json', 'utf8'));
console.log(`Found ${data.length} workflows:\n`);
data.forEach((w, i) => {
  console.log(`${i + 1}. Name: "${w.name}"`);
  console.log(`   ID: ${w.id}`);
  console.log(`   Active: ${w.active}`);
  console.log(`   Nodes: ${w.nodes.length} nodes (${w.nodes.map(n => n.name).join(', ')})`);
  console.log(`   Created: ${w.createdAt} | Updated: ${w.updatedAt}\n`);
});
