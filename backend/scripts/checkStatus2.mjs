import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Check distinct chapterIds in questions
const qChapters = await p.question.groupBy({ by: ['chapterId'], _count: true });
console.log('Distinct chapterIds in questions:', qChapters.length);
console.log('Top 5 by count:', qChapters.sort((a,b) => b._count._all - a._count._all).slice(0, 5).map(c => `${c.chapterId}: ${c._count._all}`));

// Check total chapters in DB
const totalChapters = await p.chapter.count();
console.log('\nTotal chapters in DB:', totalChapters);

// Check if chapters match
const chIds = new Set((await p.chapter.findMany({ select: { id: true } })).map(c => c.id));
const unmatched = qChapters.filter(c => !chIds.has(c.chapterId));
console.log('Questions with chapterId NOT in chapters table:', unmatched.length);
if (unmatched.length > 0) {
  console.log('Unmatched IDs:', unmatched.slice(0, 5).map(c => `${c.chapterId}: ${c._count._all}`));
}

// Show chapters with their question counts (only those that have questions)
const matched = qChapters.filter(c => chIds.has(c.chapterId));
console.log('\nChapters WITH questions:');
for (const m of matched.sort((a,b) => b._count._all - a._count._all)) {
  const ch = await p.chapter.findUnique({ where: { id: m.chapterId }, include: { subject: true } });
  console.log(`  ${ch.name} (${ch.subject?.name}): ${m._count._all}`);
}

await p.$disconnect();
