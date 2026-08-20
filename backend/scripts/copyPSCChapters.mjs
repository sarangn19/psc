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

const chaptersToCopy = ['Important Appointments', 'Proverbs'];

for (const chapterName of chaptersToCopy) {
  console.log(`\n--- Copying: ${chapterName} ---`);
  
  // Get source from LDC
  const ldcExam = await prisma.exam.findFirst({ where: { name: 'LDC (Lower Division Clerk)' } });
  let sourceChapter = null;
  const ldcSubjects = await prisma.subject.findMany({ where: { examId: ldcExam.id } });
  for (const sub of ldcSubjects) {
    const ch = await prisma.chapter.findFirst({ where: { subjectId: sub.id, name: chapterName } });
    if (ch) { sourceChapter = ch; break; }
  }
  if (!sourceChapter) { console.log('Source chapter not found'); continue; }

  const sourceQuestions = await prisma.question.findMany({ where: { chapterId: sourceChapter.id } });
  console.log(`LDC has ${sourceQuestions.length} questions`);

  for (const examName of pscExamNames) {
    if (examName === 'LDC (Lower Division Clerk)') continue;
    
    const exam = await prisma.exam.findFirst({ where: { name: examName } });
    const subjects = await prisma.subject.findMany({ where: { examId: exam.id } });
    
    let targetChapter = null;
    for (const sub of subjects) {
      const ch = await prisma.chapter.findFirst({ where: { subjectId: sub.id, name: chapterName } });
      if (ch) { targetChapter = ch; break; }
    }
    if (!targetChapter) { console.log(`${examName}: chapter not found`); continue; }

    const existingTexts = new Set();
    const existing = await prisma.question.findMany({ where: { chapterId: targetChapter.id }, select: { text: true } });
    for (const q of existing) existingTexts.add(q.text.toLowerCase().replace(/[^a-z0-9]/g, ''));

    let inserted = 0;
    for (const q of sourceQuestions) {
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
}

await prisma.$disconnect();
console.log('\nDone!');
