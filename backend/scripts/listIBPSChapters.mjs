import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Find IBPS PO exam
const exam = await prisma.exam.findFirst({ where: { name: 'IBPS PO' } });

// Find all subjects and their chapters
const subjects = await prisma.subject.findMany({
  where: { examId: exam.id },
  include: { chapters: { include: { _count: { select: { questions: true } } } } }
});

for (const sub of subjects) {
  console.log(`\n${sub.name}:`);
  for (const ch of sub.chapters) {
    console.log(`  ${ch.name} (${ch._count.questions} questions)`);
  }
}

await prisma.$disconnect();
