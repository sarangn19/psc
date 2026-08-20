import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const pscExamNames = [
  'LDC (Lower Division Clerk)',
  'LGS (Last Grade Servant)',
  'Police Constable',
  'PSC Degree Level',
  'HSST (Higher Secondary School Teacher)',
  'VEO (Village Extension Officer)'
];

// Get LDC exam
const ldcExam = await prisma.exam.findFirst({ where: { name: 'LDC (Lower Division Clerk)' } });
if (!ldcExam) { console.log('LDC not found'); process.exit(1); }

// Get Padyam chapter in LDC
const ldcSubject = await prisma.subject.findFirst({ where: { examId: ldcExam.id, name: 'Malayalam' } });
const ldcChapter = await prisma.chapter.findFirst({ where: { subjectId: ldcSubject?.id, name: 'Padyam' } });
if (!ldcChapter) { console.log('LDC Padyam chapter not found'); process.exit(1); }

const ldcQuestions = await prisma.question.findMany({ where: { chapterId: ldcChapter.id } });
console.log(`LDC Padyam has ${ldcQuestions.length} questions`);

for (const examName of pscExamNames) {
  if (examName === 'LDC (Lower Division Clerk)') continue;
  
  const exam = await prisma.exam.findFirst({ where: { name: examName } });
  const subjects = await prisma.subject.findMany({ where: { examId: exam.id } });
  
  // Find Padyam chapter across all subjects
  let targetChapter = null;
  for (const sub of subjects) {
    const ch = await prisma.chapter.findFirst({ where: { subjectId: sub.id, name: 'Padyam' } });
    if (ch) { targetChapter = ch; break; }
  }
  if (!targetChapter) { console.log(`${examName}: Padyam chapter not found`); continue; }

  // Get existing texts in target
  const existingTexts = new Set();
  const existing = await prisma.question.findMany({ where: { chapterId: targetChapter.id }, select: { text: true } });
  for (const q of existing) existingTexts.add(q.text.toLowerCase().replace(/[^a-z0-9]/g, ''));

  let inserted = 0;
  for (const q of ldcQuestions) {
    const norm = q.text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (existingTexts.has(norm)) continue;
    existingTexts.add(norm);
    
    await prisma.question.create({
      data: {
        chapterId: targetChapter.id,
        conceptId: q.conceptId,
        text: q.text,
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        difficulty: q.difficulty,
        tags: [...q.tags, 'copied:ldc'],
        isActive: true
      }
    });
    inserted++;
  }
  console.log(`${examName}: +${inserted}`);
}

await prisma.$disconnect();
console.log('Done!');
