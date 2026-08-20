import fs from 'fs';
import path from 'path';

const csvPath = process.argv[2];
if (!csvPath) { console.error('Usage: node csvToJson.mjs <input.csv>'); process.exit(1); }

const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.split('\n').filter(l => l.trim());
const headers = lines[0].split(',');

const json = [];
for (let i = 1; i < lines.length; i++) {
  const vals = [];
  let current = '';
  let inQuotes = false;
  for (const ch of lines[i]) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { vals.push(current); current = ''; }
    else { current += ch; }
  }
  vals.push(current);

  const row = {};
  headers.forEach((h, idx) => row[h.trim()] = (vals[idx] || '').trim().replace(/^"|"$/g, ''));

  json.push({
    q: row.question,
    opts: [row.option_a, row.option_b, row.option_c, row.option_d],
    a: row.answer?.toUpperCase(),
    exp: row.explanation || '',
    d: row.difficulty || 'MEDIUM'
  });
}

const outPath = csvPath.replace(/\.csv$/, '.json');
fs.writeFileSync(outPath, JSON.stringify(json, null, 2));
console.log(`✅ Converted ${json.length} questions → ${path.basename(outPath)}`);
