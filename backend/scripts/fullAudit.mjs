import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// 1. Check conceptId coverage
const total = await p.question.count();
const withConcept = await p.question.count({ where: { conceptId: { not: null } } });
const withoutConcept = await p.question.count({ where: { conceptId: null } });
console.log(`=== ConceptId Coverage ===`);
console.log(`Total questions: ${total}`);
console.log(`With conceptId: ${withConcept}`);
console.log(`Without conceptId: ${withoutConcept}`);

// 2. Check exams and their chapters
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

console.log(`\n=== Exams & Question Coverage ===`);
for (const exam of exams) {
  let totalQ = 0;
  let totalCh = 0;
  let emptyCh = 0;
  const details = [];
  for (const sub of exam.subjects) {
    for (const ch of sub.chapters) {
      totalCh++;
      totalQ += ch._count.questions;
      if (ch._count.questions === 0) emptyCh++;
      details.push({ name: ch.name, subject: sub.name, count: ch._count.questions });
    }
  }
  const uniqueSubs = [...new Set(exam.subjects.map(s => s.name))];
  console.log(`\n${exam.name}: ${totalQ} questions / ${totalCh} chapters (${emptyCh} empty)`);
  console.log(`  Subjects: ${uniqueSubs.join(', ')}`);
  for (const d of details.sort((a,b) => a.count - b.count)) {
    const marker = d.count === 0 ? '❌' : d.count < 50 ? '⚠️' : '✅';
    console.log(`  ${marker} ${d.name} (${d.subject}): ${d.count}`);
  }
}

// 3. LDC chapters detail (primary exam)
console.log(`\n=== LDC Gap Analysis (<50 questions) ===`);
const ldc = exams.find(e => e.name.includes('LDC'));
if (ldc) {
  const gaps = [];
  for (const sub of ldc.subjects) {
    for (const ch of sub.chapters) {
      if (ch._count.questions < 50) {
        gaps.push({ name: ch.name, subject: sub.name, count: ch._count.questions, id: ch.id });
      }
    }
  }
  gaps.sort((a,b) => a.count - b.count);
  for (const g of gaps) {
    console.log(`  ${g.name} (${g.subject}): ${g.count} [id: ${g.id}]`);
  }
}

await p.$disconnect();
