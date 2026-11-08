const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');
const p = new PrismaClient();
(async () => {
  const wb = XLSX.readFile('C:/Users/saran/Documents/psc app/chat_questions.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const ids = [...new Set(rows.map(r => r['Concept ID']).filter(v => v !== null && v !== undefined).map(Number))];
  const chapters = await p.chapter.findMany({ include: { subject: { include: { exam: true } } } });
  const chapMap = new Map(chapters.map(c => [c.id, c]));
  const nodes = await p.taxonomyNode.findMany({ where: { id: { in: ids } } });
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const qs = await p.question.findMany({ where: { conceptId: { in: ids } }, select: { conceptId: true, chapterId: true } });
  // group
  const byConcept = new Map();
  for (const q of qs) {
    if (!byConcept.has(q.conceptId)) byConcept.set(q.conceptId, new Map());
    const m = byConcept.get(q.conceptId);
    m.set(q.chapterId, (m.get(q.chapterId) || 0) + 1);
  }
  const verified = [], ambiguous = [], unmapped = [];
  for (const id of ids) {
    const node = nodeMap.get(id);
    const m = byConcept.get(id);
    if (!m) { unmapped.push({ conceptId: id, node: node ? node.nameEnglish : null, reason: 'no existing question relationship' }); continue; }
    if (m.size === 1) {
      const [cid] = [...m.keys()];
      const ch = chapMap.get(cid);
      verified.push({ conceptId: id, node: node ? node.nameEnglish : null, chapterId: cid, chapterName: ch ? ch.name : null, exam: ch ? ch.subject.exam.name : null, subject: ch ? ch.subject.name : null, count: [...m.values()][0] });
    } else {
      ambiguous.push({ conceptId: id, node: node ? node.nameEnglish : null, chapters: [...m.entries()].map(([cid, cnt]) => ({ chapterId: cid, chapterName: chapMap.get(cid)?.name, exam: chapMap.get(cid)?.subject.exam.name, count: cnt })) });
    }
  }
  const unmappedNoExisting = unmapped.length;
  // unmapped with existing? already none. Also include concepts not in spreadsheet? no.
  fs.writeFileSync('C:/Users/saran/Documents/psc app/verified_mappings.json', JSON.stringify(verified, null, 2));
  fs.writeFileSync('C:/Users/saran/Documents/psc app/ambiguous_mappings.json', JSON.stringify(ambiguous, null, 2));
  fs.writeFileSync('C:/Users/saran/Documents/psc app/unmapped_concepts.json', JSON.stringify(unmapped, null, 2));
  // count importable rows
  const verifiedSet = new Set(verified.map(v => v.conceptId));
  let importable = 0, invalid = 0, missingAns = 0, missingOpts = 0;
  for (const r of rows) {
    const cid = r['Concept ID'];
    if (!verifiedSet.has(Number(cid))) continue;
    const opts = [r['Option A'], r['Option B'], r['Option C'], r['Option D']].filter(x => x !== null && String(x).trim() !== '');
    const ans = r['Answer'];
    if (!r['Question'] || !String(r['Question']).trim()) { invalid++; continue; }
    if (opts.length < 2) { missingOpts++; continue; }
    if (ans === null || ans === undefined || String(ans).trim() === '') { missingAns++; continue; }
    importable++;
  }
  console.log(JSON.stringify({ verified: verified.length, ambiguous: ambiguous.length, unmapped: unmapped.length, importableRows: importable, missingAns, missingOpts, invalid }, null, 2));
  await p.$disconnect();
})();
