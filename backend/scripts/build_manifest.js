const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');
const p = new PrismaClient();
function norm(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }
(async () => {
  const verified = JSON.parse(fs.readFileSync('C:/Users/saran/Documents/psc app/verified_mappings.json','utf8'));
  const vmap = new Map(verified.map(v => [v.conceptId, v]));
  const wb = XLSX.readFile('C:/Users/saran/Documents/psc app/chat_questions.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const existing = await p.question.findMany({ select: { text: true } });
  const existingSet = new Set(existing.map(q => norm(q.text)));
  const manifest = [];
  let ready=0, missingAns=0, missingOpts=0, dupDb=0, dupFile=0, missingExpl=0;
  const fileSeen = new Set();
  for (let i=0;i<rows.length;i++){
    const r = rows[i];
    const cid = Number(r['Concept ID']);
    const v = vmap.get(cid);
    if (!v) continue;
    const qtext = r['Question'];
    const opts = [r['Option A'], r['Option B'], r['Option C'], r['Option D'], r['Option E'], r['Option F'], r['Option G'], r['Option H']].map(x => (x===null||x===undefined)?null:String(x).trim()).filter(x=>x!==null && x!=='');
    const ans = r['Answer'];
    const expl = r['Explanation'];
    let status = 'READY';
    if (!qtext || !String(qtext).trim()) status='INVALID_QUESTION';
    if (opts.length < 2) { status='MISSING_OPTIONS'; missingOpts++; }
    if (ans === null || ans === undefined || String(ans).trim()==='') { status='MISSING_ANSWER'; missingAns++; }
    if (expl === null || expl === undefined || String(expl).trim()==='') missingExpl++;
    const nq = norm(qtext);
    if (existingSet.has(nq)) { status='DUPLICATE_DB'; dupDb++; }
    if (fileSeen.has(nq)) { status='DUPLICATE_FILE'; dupFile++; }
    fileSeen.add(nq);
    if (status==='READY') ready++;
    manifest.push({ sourceRow: i+2, question: qtext, options: opts, answer: ans, explanation: expl, conceptId: cid, chapterId: v.chapterId, validationStatus: status });
  }
  fs.writeFileSync('C:/Users/saran/Documents/psc app/import_manifest.json', JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ totalManifest: manifest.length, ready, missingAns, missingOpts, dupDb, dupFile, missingExpl }, null, 2));
  await p.$disconnect();
})();
