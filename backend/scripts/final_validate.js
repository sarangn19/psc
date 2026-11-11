const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();
function norm(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }
(async () => {
  const normData = JSON.parse(fs.readFileSync('C:/Users/saran/Documents/psc app/normalized_answers.json','utf8'));
  const manifest = JSON.parse(fs.readFileSync('C:/Users/saran/Documents/psc app/import_manifest.json','utf8'));
  const mByRow = new Map(manifest.map(m=>[m.sourceRow,m]));
  const chapters = new Set((await p.chapter.findMany({select:{id:true}})).map(c=>c.id));
  const existing = new Set((await p.question.findMany({select:{text:true}})).map(q=>norm(q.text)));
  const final=[]; let valid=0,dupDb=0,dupFile=0,invalidChap=0;
  const fileSeen=new Set();
  for (const n of normData) {
    const m = mByRow.get(n.sourceRow);
    if (!m) { continue; }
    let status='VALID';
    if (!chapters.has(m.chapterId)) { status='INVALID_CHAPTER'; invalidChap++; }
    const nq = norm(m.question);
    if (existing.has(nq)) { status='DUPLICATE_DB'; dupDb++; }
    if (fileSeen.has(nq)) { status='DUPLICATE_FILE'; dupFile++; }
    fileSeen.add(nq);
    if (status==='VALID') valid++;
    final.push({ sourceRow: m.sourceRow, question: m.question, options: m.options, correctOption: n.normalizedIndex, explanation: m.explanation, conceptId: m.conceptId, chapterId: m.chapterId, validationStatus: status });
  }
  fs.writeFileSync('C:/Users/saran/Documents/psc app/final_import_manifest.json', JSON.stringify(final,null,2));
  const report = { total: final.length, valid, duplicateDb: dupDb, duplicateFile: dupFile, invalidChapter: invalidChap };
  fs.writeFileSync('C:/Users/saran/Documents/psc app/final_import_validation_report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await p.$disconnect();
})();
