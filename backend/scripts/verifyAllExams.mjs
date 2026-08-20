import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Quick verify for each exam
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
  let empty = 0;
  for (const sub of exam.subjects) {
    for (const ch of sub.chapters) {
      total += ch._count.questions;
      if (ch._count.questions === 0) empty++;
    }
  }
  const status = total >= 6000 ? '✅' : total > 0 ? '⚠️' : '❌';
  console.log(`${status} ${exam.name}: ${total} questions, ${empty} empty chapters`);
}

// Check conceptId coverage
const noConcept = await p.question.count({ where: { conceptId: null } });
const withConcept = await p.question.count({ where: { conceptId: { not: null } } });
console.log(`\nConceptId: ${withConcept} have / ${noConcept} missing`);

await p.$disconnect();
