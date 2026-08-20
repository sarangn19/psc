import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const originalPscNames = [
  'LDC (Lower Division Clerk)', 'LGS (Last Grade Servant)',
  'PSC Degree Level', 'Police Constable',
  'HSST (Higher Secondary School Teacher)', 'VEO (Village Extension Officer)',
];

const exams = await prisma.exam.findMany({
  where: { category: 'PSC' },
  include: { subjects: { include: { chapters: { include: { _count: { select: { questions: true } } } } } } },
});

let totalEmpty = 0;
for (const exam of exams) {
  if (originalPscNames.includes(exam.name)) continue;
  const emptyChapters = exam.subjects.flatMap(s => s.chapters).filter(c => c._count.questions === 0);
  const withQ = exam.subjects.flatMap(s => s.chapters).filter(c => c._count.questions > 0).length;
  if (emptyChapters.length > 0) {
    console.log(`${exam.name}: ${withQ} chapters with Q / ${emptyChapters.length} EMPTY`);
    totalEmpty += emptyChapters.length;
  }
}
console.log(`\nTotal empty chapters across new exams: ${totalEmpty}`);
await prisma.$disconnect();