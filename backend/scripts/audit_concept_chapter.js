const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');
const prisma = new PrismaClient();
const OUT = 'C:/Users/saran/Documents/psc app/concept_chapter_audit.json';

(async () => {
  const wb = XLSX.readFile('C:/Users/saran/Documents/psc app/chat_questions.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const ids = [...new Set(rows.map(r => r['Concept ID']).filter(v => v !== null && v !== undefined).map(Number))];
  const chapters = await prisma.chapter.findMany({ include: { subject: { include: { exam: true } } } });
  const nodes = await prisma.taxonomyNode.findMany({ where: { id: { in: ids } } });
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const results = [];
  for (const id of ids) {
    const node = nodeMap.get(id);
    if (!node) { results.push({ id, status: 'UNMAPPED', reason: 'concept not found', chapters: [] }); continue; }
    const name = node.nameEnglish.trim().toLowerCase();
    const matches = chapters.filter(c => c.name.trim().toLowerCase() === name);
    if (matches.length === 1) {
      results.push({ id, status: 'HIGH_CONFIDENCE', reason: 'exact chapter name match', node: node.nameEnglish, chapterId: matches[0].id, chapterName: matches[0].name, exam: matches[0].subject.exam.name });
    } else if (matches.length > 1) {
      results.push({ id, status: 'AMBIGUOUS', reason: 'multiple chapter name matches', node: node.nameEnglish, chapters: matches.map(c => ({ id: c.id, name: c.name, exam: c.subject.exam.name })) });
    } else {
      results.push({ id, status: 'UNMAPPED', reason: 'no chapter name match', node: node.nameEnglish, chapters: [] });
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const summary = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  console.log(JSON.stringify({ total: ids.length, ...summary }, null, 2));
  await prisma.$disconnect();
})();
