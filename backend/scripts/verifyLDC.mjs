import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const exams = await p.exam.findMany({
  include: {
    subjects: {
      include: {
        chapters: {
          include: { _count: { select: { questions: true } } }
        }
      }
    }
  }
});

for (const exam of exams) {
  let total = 0;
  const chaps = [];
  for (const sub of exam.subjects) {
    for (const ch of sub.chapters) {
      total += ch._count.questions;
      if (ch._count.questions > 0) {
        chaps.push(`${ch.name} (${sub.name}): ${ch._count.questions} [id: ${ch.id}]`);
      }
    }
  }
  if (total > 0) {
    console.log(`\n${exam.name} (${exam.id}): ${total} questions`);
    for (const c of chaps) console.log(`  ${c}`);
  }
}

// Also check: what chapterId do recently imported questions have?
const recent = await p.question.findMany({
  where: { tags: { has: 'ai:generated' } },
  select: { id: true, text: true, chapterId: true },
  take: 5
});
console.log('\nSample recent questions:');
for (const r of recent) {
  const ch = await p.chapter.findUnique({ where: { id: r.chapterId }, select: { name: true, subject: { select: { exam: { select: { name: true } } } } } });
  console.log(`  "${r.text.slice(0, 50)}..." → ${ch.name} (${ch.subject?.exam?.name})`);
}

await p.$disconnect();
