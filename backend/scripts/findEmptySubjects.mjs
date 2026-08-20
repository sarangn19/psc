import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const originalPscNames = [
  'LDC (Lower Division Clerk)', 'LGS (Last Grade Servant)',
  'PSC Degree Level', 'Police Constable',
  'HSST (Higher Secondary School Teacher)', 'VEO (Village Extension Officer)',
];

const exams = await prisma.exam.findMany({
  where: { category: 'PSC' },
  include: { subjects: { include: { chapters: true } } },
  orderBy: { createdAt: 'asc' },
});

for (const exam of exams) {
  if (originalPscNames.includes(exam.name)) continue;
  const emptySubjects = exam.subjects.filter(s => s.chapters.length === 0);
  if (emptySubjects.length > 0) {
    console.log(`${exam.name}: ${emptySubjects.map(s => s.name).join(', ')}`);
  }
}

await prisma.$disconnect();