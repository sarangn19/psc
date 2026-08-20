import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const bankingExams = await p.exam.findMany({
  where: { category: 'Banking' },
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

// Focus on IBPS PO as the reference exam
const ibps = bankingExams[0];
console.log(`=== ${ibps.name} Gap Analysis ===\n`);

let totalEmpty = 0;
let totalLow = 0;

for (const sub of ibps.subjects) {
  const empty = sub.chapters.filter(c => c._count.questions === 0);
  const low = sub.chapters.filter(c => c._count.questions > 0 && c._count.questions < 20);
  const ok = sub.chapters.filter(c => c._count.questions >= 20);

  if (empty.length > 0 || low.length > 0) {
    console.log(`${sub.name}:`);
    for (const c of empty) {
      console.log(`  ❌ ${c.name}: 0 questions`);
      totalEmpty++;
    }
    for (const c of low) {
      console.log(`  ⚠️  ${c.name}: ${c._count.questions} questions`);
      totalLow++;
    }
  }
}

console.log(`\nTotal empty: ${totalEmpty}`);
console.log(`Total low (<20): ${totalLow}`);
console.log(`Total to generate: ${totalEmpty + totalLow}`);

await p.$disconnect();
