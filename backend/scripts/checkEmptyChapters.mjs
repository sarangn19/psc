import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const exams = await prisma.exam.findMany({ include: { subjects: { include: { chapters: { include: { questions: true } } } } } });
for (const exam of exams) {
  const allChapters = exam.subjects.flatMap(s => s.chapters);
  const empties = allChapters.filter(c => c.questions.length === 0).map(c => c.name);
  const low = allChapters.filter(c => c.questions.length > 0 && c.questions.length <= 10).map(c => `${c.name} (${c.questions.length})`);
  if (empties.length > 0) {
    console.log(`${exam.name} — ${empties.length} EMPTY chapters:`);
    empties.forEach(n => console.log(`  - ${n}`));
  }
  if (low.length > 0) {
    console.log(`${exam.name} — ${low.length} LOW chapters (<=10):`);
    low.forEach(n => console.log(`  - ${n}`));
  }
}
await prisma.$disconnect();
