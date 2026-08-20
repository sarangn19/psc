import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Show chapters in the 6 original PSC exams by subject, as a copy source map
const sourceExams = ['LDC (Lower Division Clerk)', 'LGS (Last Grade Servant)'];
for (const examName of sourceExams) {
  const exam = await prisma.exam.findFirst({ where: { name: examName }, include: { subjects: { include: { chapters: true } } } });
  console.log(`\n=== ${examName} ===`);
  for (const sub of exam.subjects) {
    console.log(`  ${sub.name}:`);
    for (const ch of sub.chapters) console.log(`    - ${ch.name}`);
  }
}

// Also banking source subjects/chapters
const bankExam = await prisma.exam.findFirst({ where: { name: 'IBPS PO' }, include: { subjects: { include: { chapters: true } } } });
console.log(`\n=== IBPS PO subjects ===`);
for (const sub of bankExam.subjects) console.log(`  ${sub.name} (${sub.chapters.length} chapters)`);

await prisma.$disconnect();