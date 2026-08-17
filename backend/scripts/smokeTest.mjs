import fs from 'node:fs';
for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const demo = await p.user.findUnique({
  where: { email: 'demo@student.com' },
  select: { id: true, email: true },
});
if (!demo) { console.log('NO DEMO USER'); await p.$disconnect(); process.exit(1); }
const learned = await p.userChapter.findMany({
  where: { userId: demo.id, isLearned: true },
  select: { chapterId: true },
});
const learnedChapters = learned.map((c) => c.chapterId);
console.log('demo user:', demo.email, '| learned chapters:', learnedChapters.length);

// HOME FLOW: questions available for learned chapters (what /session/start serves)
const homeAll = await p.question.findMany({
  where: { chapterId: { in: learnedChapters }, isActive: true },
  select: { id: true, text: true, options: true, correctOption: true, conceptId: true, chapterId: true },
});
const homeQ = homeAll.filter((q) => Array.isArray(q.options) && q.options.length === 4);
console.log('\nHOME FLOW — questions available for learned chapters:', (await p.question.count({ where: { chapterId: { in: learnedChapters }, isActive: true } })));
for (const q of homeQ.slice(0, 3)) console.log(`  [chap ${q.chapterId.slice(0, 8)}] ${q.text.slice(0, 60)} | opts=${q.options.length} correct=${q.correctOption} concept=${q.conceptId}`);

// FOCUSED PRACTICE on concept 614 (Indian Constitution)
const focused = await p.question.findMany({
  where: { conceptId: 614, isActive: true },
  take: 3,
  select: { id: true, text: true, options: true, correctOption: true },
});
console.log('\nFOCUSED (concept 614 Indian Constitution) — available:', (await p.question.count({ where: { conceptId: 614 } })));
for (const q of focused) console.log(`  ${q.text.slice(0, 60)} | opts=${q.options.length} correct=${q.correctOption}`);

// CONCEPT COVERAGE sanity
const withConcept = await p.question.count({ where: { conceptId: { not: null }, isActive: true } });
const total = await p.question.count({ where: { isActive: true } });
console.log(`\nCONCEPT COVERAGE: ${withConcept}/${total} active questions have a conceptId`);

await p.$disconnect();
