import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const total = await p.question.count();
console.log('Total questions:', total);

const ldc = await p.exam.findFirst({ where: { name: { contains: 'LDC' } } });
const chapters = await p.chapter.findMany({
  where: { subject: { examId: ldc.id } },
  include: { _count: { select: { questions: true } } },
  orderBy: { questions: { _count: 'desc' } }
});

const withQ = chapters.filter(c => c._count.questions > 0);
const withoutQ = chapters.filter(c => c._count.questions === 0);

console.log(`\nLDC chapters WITH questions (${withQ.length}):`);
for (const c of withQ) {
  console.log(`  ${c.name.padEnd(30)} ${c._count.questions}`);
}

console.log(`\nLDC chapters WITHOUT questions (${withoutQ.length}):`);
for (const c of withoutQ) {
  console.log(`  ${c.name}`);
}

const dist = await p.question.groupBy({ by: ['correctOption'], _count: true });
console.log('\nAnswer distribution:');
for (const d of dist) {
  console.log(`  Option ${d.correctOption}: ${d._count._all}`);
}

await p.$disconnect();
