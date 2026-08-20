import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Check chapters for a new exam vs existing exam
for (const examName of ['Junior Supervisor', 'Section Officer', 'IBPS PO', 'LDC (Lower Division Clerk)']) {
  const exam = await prisma.exam.findFirst({ where: { name: examName }, include: { subjects: { include: { chapters: true } } } });
  if (!exam) { console.log(`${examName}: NOT FOUND`); continue; }
  const chapterCount = exam.subjects.reduce((s, sub) => s + sub.chapters.length, 0);
  console.log(`\n${examName}: ${exam.subjects.length} subjects, ${chapterCount} chapters`);
  for (const sub of exam.subjects) {
    console.log(`  ${sub.name}: ${sub.chapters.length} chapters ${sub.chapters.length === 0 ? '⚠️ NO CHAPTERS' : ''}`);
  }
}

await prisma.$disconnect();
