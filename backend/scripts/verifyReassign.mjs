import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const total = await p.question.count();
console.log('Total questions:', total);

const chapters = await p.chapter.findMany({
  include: { _count: { select: { questions: true } } },
  orderBy: { questions: { _count: 'desc' } }
});

const withQ = chapters.filter(c => c._count.questions > 0);
const withoutQ = chapters.filter(c => c._count.questions === 0);

console.log(`\nChapters WITH questions (${withQ.length}):`);
let sum = 0;
for (const c of withQ) {
  console.log(`  ${c.name.padEnd(30)} ${c._count.questions}`);
  sum += c._count.questions;
}
console.log(`  ${''.padEnd(30)} -----`);
console.log(`  ${''.padEnd(30)} ${sum}`);

console.log(`\nChapters WITHOUT questions (${withoutQ.length}):`);
for (const c of withoutQ) {
  console.log(`  ${c.name}`);
}

await p.$disconnect();
