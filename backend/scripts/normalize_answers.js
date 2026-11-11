const XLSX = require('xlsx');
const fs = require('fs');
const wb = XLSX.readFile('C:/Users/saran/Documents/psc app/chat_questions.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
const verified = JSON.parse(fs.readFileSync('C:/Users/saran/Documents/psc app/verified_mappings.json','utf8'));
const vset = new Set(verified.map(v=>v.conceptId));
const normalized=[], unresolved=[];
let total=0, ok=0, amb=0, invalid=0, unmatched=0, conflict=0;
for (let i=0;i<rows.length;i++){
  const r=rows[i];
  const cid=Number(r['Concept ID']);
  if(!vset.has(cid)) continue;
  total++;
  const opts=[r['Option A'],r['Option B'],r['Option C'],r['Option D'],r['Option E'],r['Option F'],r['Option G'],r['Option H']].map(x=>x===null||x===undefined?null:String(x).trim()).filter(x=>x!==null&&x!=='');
  const ansRaw = r['Answer'];
  let idx=null, method=null;
  const s = String(ansRaw||'').trim();
  // Option X
  let m = s.match(/Option\s*([A-H])/i);
  if (m) { idx = m[1].toUpperCase().charCodeAt(0)-65; method='option-letter'; }
  else {
    // standalone letter in parentheses or after colon
    m = s.match(/(?:^|[\s:(])\(?([A-H])\)?(?:\s|$)/i);
    if (m) { idx = m[1].toUpperCase().charCodeAt(0)-65; method='standalone-letter'; }
  }
  // exact option text match
  if (idx===null) {
    const low = s.toLowerCase();
    const matches = opts.map((o,oi)=> (o.toLowerCase()===low || o.toLowerCase().includes(low) && low.length>10) ? oi : -1).filter(x=>x>=0);
    if (matches.length===1) { idx=matches[0]; method='exact-text'; }
    else if (matches.length>1) { conflict++; }
  }
  // validate
  if (idx===null) { unmatched++; unresolved.push({sourceRow:i+2, answer: ansRaw, reason:'no parse'}); continue; }
  if (idx >= opts.length) { invalid++; unresolved.push({sourceRow:i+2, answer: ansRaw, reason:'index out of range'}); continue; }
  // conflict if multiple option letters?
  const letters = s.match(/Option\s*([A-H])/gi);
  if (letters && new Set(letters.map(x=>x.slice(-1).toUpperCase())).size>1) { conflict++; unresolved.push({sourceRow:i+2, answer: ansRaw, reason:'multiple letters'}); continue; }
  ok++;
  normalized.push({ sourceRow:i+2, conceptId:cid, options:opts, rawAnswer:ansRaw, normalizedIndex:idx, method });
}
const report = { totalRows: total, successfullyNormalized: ok, ambiguous: amb, invalid, unmatched, conflicting: conflict, importReady: ok };
fs.writeFileSync('C:/Users/saran/Documents/psc app/normalized_answers.json', JSON.stringify(normalized,null,2));
fs.writeFileSync('C:/Users/saran/Documents/psc app/unresolved_answers.json', JSON.stringify(unresolved,null,2));
fs.writeFileSync('C:/Users/saran/Documents/psc app/answer_normalization_report.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
