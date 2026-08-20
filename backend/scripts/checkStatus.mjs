import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const count = await p.question.count();
console.log('Total questions:', count);

const chapters = await p.chapter.findMany({ include: { _count: { select: { questions: true } } } });
const sorted = chapters.sort((a, b) => a._count.questions - b._count.questions);
const gap = sorted.filter(c => c._count.questions < 50).map(c => `  ${c.name}: ${c._count.questions}`);
console.log(`Chapters < 50 questions (${gap.length}):`);
gap.forEach(g => console.log(g));

const dist = await p.question.groupBy({ by: ['correctOption'], _count: true });
console.log('Answer dist:', dist.map(d => `${d.correctOption}:${d._count._all}`).join(', '));

await p.$disconnect();
