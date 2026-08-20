import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const exams = await p.exam.findMany({
  include: { subjects: { include: { chapters: { include: { _count: { select: { questions: true } } } } } } },
  orderBy: { createdAt: 'asc' }
});

for (const exam of exams) {
  let totalQ = 0;
  for (const sub of exam.subjects) {
    for (const ch of sub.chapters) {
      totalQ += ch._count.questions;
    }
  }
  console.log(`\n${exam.name} (id: ${exam.id.slice(0, 15)}...)`);
  for (const sub of exam.subjects) {
    const chWithQ = sub.chapters.filter(c => c._count.questions > 0);
    const chWithoutQ = sub.chapters.filter(c => c._count.questions === 0);
    if (chWithQ.length > 0 || chWithoutQ.length > 0) {
      console.log(`  ${sub.name}: ${chWithQ.length} chapters with Q, ${chWithoutQ.length} empty`);
    }
  }
  console.log(`  Total questions: ${totalQ}`);
}

await p.$disconnect();
