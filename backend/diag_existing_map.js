const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const p = new PrismaClient();
(async () => {
  const wb = XLSX.readFile('C:/Users/saran/Documents/psc app/chat_questions.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const ids = [...new Set(rows.map(r => r['Concept ID']).filter(v => v !== null && v !== undefined).map(Number))];
  // existing mapping by concept
  const qs = await p.question.findMany({ where: { conceptId: { in: ids } }, select: { conceptId: true, chapterId: true } });
  const map = new Map();
  for (const q of qs) {
    if (!map.has(q.conceptId)) map.set(q.conceptId, new Map());
    const m = map.get(q.conceptId);
    m.set(q.chapterId, (m.get(q.chapterId) || 0) + 1);
  }
  let exactSingle = 0, multi = 0, none = 0;
  for (const id of ids) {
    const m = map.get(id);
    if (!m) { none++; continue; }
    if (m.size === 1) exactSingle++; else multi++;
  }
  console.log(JSON.stringify({ uniqueIds: ids.length, withExisting: map.size, singleChapter: exactSingle, multipleChapters: multi, noExisting: none }, null, 2));
  await p.$disconnect();
})();
