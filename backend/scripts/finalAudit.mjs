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
  },
  orderBy: { createdAt: 'asc' }
});

let grandTotal = 0;
for (const exam of exams) {
  let total = 0;
  let empty = 0;
  let chapters = 0;
  for (const sub of exam.subjects) {
    for (const ch of sub.chapters) {
      total += ch._count.questions;
      chapters++;
      if (ch._count.questions === 0) empty++;
    }
  }
  grandTotal += total;
  const status = total > 0 ? '✅' : '❌';
  console.log(`${status} ${exam.name.padEnd(30)} ${String(total).padStart(6)} questions  ${empty === 0 ? '0' : empty} empty chapters / ${chapters} total`);
}

console.log(`\n📊 Grand total: ${grandTotal} questions across ${exams.length} exams`);

const conceptMissing = await p.question.count({ where: { conceptId: null } });
console.log(`ConceptId missing: ${conceptMissing}`);

await p.$disconnect();
