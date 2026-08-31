const fs = require('fs');
const { execSync } = require('child_process');

try {
  execSync('n8n.cmd export:workflow --id=hr-recruitment-pipeline-01 --output=current_hr_workflow.json');
  const wf = JSON.parse(fs.readFileSync('current_hr_workflow.json', 'utf8'));
  console.log(`Workflow Found: ${wf.name} (ID: ${wf.id})`);
  console.log(`Nodes count: ${wf.nodes.length}`);
  console.log(`Nodes: ${wf.nodes.map(n => n.name).join(' -> ')}`);
} catch (e) {
  console.error("Export error:", e.message);
}
