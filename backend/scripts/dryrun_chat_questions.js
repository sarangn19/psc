const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const p = new PrismaClient();
(async () => {
  const wb = XLSX.readFile('C:/Users/saran/Documents/psc app/chat_questions.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  let total = rows.length;
  let valid = 0, invalid = 0, missingAnswer = 0, missingOpts = 0, unmappedConcept = 0, missingExpl = 0, fourOpts = 0;
  const conceptIds = new Set((await p.taxonomyNode.findMany({ select: { id: true } })).map(x => x.id));
  for (const r of rows) {
    const q = r['Question'];
    const opts = [r['Option A'], r['Option B'], r['Option C'], r['Option D'], r['Option E'], r['Option F'], r['Option G'], r['Option H']].filter(x => x !== null && String(x).trim() !== '');
    const ans = r['Answer'];
    const expl = r['Explanation'];
    const cid = r['Concept ID'];
    let ok = true;
    if (!q || !String(q).trim()) ok = false;
    if (opts.length < 2) { ok = false; missingOpts++; }
    if (ans === null || ans === undefined || String(ans).trim() === '') { ok = false; missingAnswer++; }
    if (!expl) missingExpl++;
    if (cid !== null && cid !== undefined && !conceptIds.has(Number(cid))) { ok = false; unmappedConcept++; }
    if (opts.length >= 4) fourOpts++;
    if (ok) valid++; else invalid++;
  }
  console.log(JSON.stringify({ total, valid, invalid, missingAnswer, missingOpts, unmappedConcept, missingExpl, fourOpts }, null, 2));
  await p.$disconnect();
})();
