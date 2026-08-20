import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const total = await p.question.count();
console.log('Total questions:', total);

// Check chapters with actual count via findMany
const chapters = await p.chapter.findMany({
  include: { _count: { select: { questions: true } } },
  orderBy: { questions: { _count: 'desc' } }
});

const withQ = chapters.filter(c => c._count.questions > 0);
const withoutQ = chapters.filter(c => c._count.questions === 0);

console.log(`\nChapters WITH questions (${withQ.length}):`);
for (const c of withQ) {
  const exam = c.subject?.exam?.name || '?';
  console.log(`  ${c.name} [${c.subject?.name}/${exam}]: ${c._count.questions}`);
}

console.log(`\nChapters WITHOUT questions (${withoutQ.length}):`);
for (const c of withoutQ.slice(0, 10)) {
  const exam = c.subject?.exam?.name || '?';
  console.log(`  ${c.name} [${c.subject?.name}/${exam}]`);
}

await p.$disconnect();
