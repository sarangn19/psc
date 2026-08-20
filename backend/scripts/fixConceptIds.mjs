import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Find questions without conceptId, grouped by chapter
const noConcept = await p.question.findMany({
  where: { conceptId: null },
  select: { id: true, chapterId: true, text: true },
  orderBy: { chapterId: 'asc' }
});

console.log(`Total without conceptId: ${noConcept.length}`);

// Group by chapter
const byChapter = new Map();
for (const q of noConcept) {
  if (!byChapter.has(q.chapterId)) byChapter.set(q.chapterId, []);
  byChapter.get(q.chapterId).push(q);
}

// For each chapter, find a concept to assign
const chapters = await p.chapter.findMany({
  select: { id: true, name: true, subject: { select: { name: true } } }
});
const chapterMap = new Map();
for (const c of chapters) chapterMap.set(c.id, c);

// Get all taxonomy nodes
const nodes = await p.taxonomyNode.findMany({
  select: { id: true, nameEnglish: true, level: true }
});
console.log(`Taxonomy nodes: ${nodes.length}`);

function findConceptForChapter(chapterName) {
  // Try exact match
  const exact = nodes.find(n => n.nameEnglish.toLowerCase() === chapterName.toLowerCase());
  if (exact) return exact.id;

  // Try partial match
  const partial = nodes.find(n => n.nameEnglish.toLowerCase().includes(chapterName.toLowerCase()));
  if (partial) return partial.id;

  // Try reverse partial
  const reverse = nodes.find(n => chapterName.toLowerCase().includes(n.nameEnglish.toLowerCase()));
  if (reverse) return reverse.id;

  return null;
}

let fixed = 0;
for (const [chapterId, questions] of byChapter) {
  const ch = chapterMap.get(chapterId);
  if (!ch) {
    console.log(`  ⚠️  Chapter ${chapterId} not found (${questions.length} questions)`);
    continue;
  }

  const conceptId = findConceptForChapter(ch.name);
  if (!conceptId) {
    console.log(`  ⚠️  No concept for "${ch.name}" (${ch.subject?.name}) - ${questions.length} questions`);
    continue;
  }

  // Update all questions in this chapter
  const ids = questions.map(q => q.id);
  await p.question.updateMany({
    where: { id: { in: ids } },
    data: { conceptId }
  });
  fixed += ids.length;
  console.log(`  ✅ ${ch.name}: ${ids.length} questions → conceptId ${conceptId}`);
}

console.log(`\nFixed: ${fixed}/${noConcept.length}`);

// Remaining
const remaining = await p.question.count({ where: { conceptId: null } });
console.log(`Still missing conceptId: ${remaining}`);

await p.$disconnect();
