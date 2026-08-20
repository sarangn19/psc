import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Source exam/subject mapping for content that can be copied
const SUBJECT_SOURCE_MAP = {
  'General Knowledge': { exam: 'LDC (Lower Division Clerk)', subject: 'General Knowledge' },
  'Current Affairs': { exam: 'LDC (Lower Division Clerk)', subject: 'Current Affairs' },
  'Mathematics': { exam: 'LDC (Lower Division Clerk)', subject: 'Mathematics' },
  'English': { exam: 'LDC (Lower Division Clerk)', subject: 'English' },
  'General Science': { exam: 'LDC (Lower Division Clerk)', subject: 'General Science' },
  'Quantitative Aptitude': { exam: 'IBPS PO', subject: 'Quantitative Aptitude' },
  'Reasoning': { exam: 'IBPS PO', subject: 'Reasoning Ability' },
  'Reasoning Ability': { exam: 'IBPS PO', subject: 'Reasoning Ability' },
  'Computer Awareness': { exam: 'IBPS PO', subject: 'Computer Awareness' },
  'Computer Applications': { exam: 'IBPS PO', subject: 'Computer Awareness' },
  'English Language': { exam: 'IBPS PO', subject: 'English Language' },
  'General Awareness': { exam: 'IBPS PO', subject: 'General Awareness' },
};

// Get all new PSC exams (category PSC, created after original 6)
const newExams = await prisma.exam.findMany({
  where: { category: 'PSC' },
  include: { subjects: true },
  orderBy: { createdAt: 'asc' },
});

const originalPscNames = [
  'LDC (Lower Division Clerk)', 'LGS (Last Grade Servant)',
  'PSC Degree Level', 'Police Constable',
  'HSST (Higher Secondary School Teacher)', 'VEO (Village Extension Officer)',
];

let totalChaptersCreated = 0;
let totalQuestionsCopied = 0;

for (const exam of newExams) {
  if (originalPscNames.includes(exam.name)) continue;

  for (const subject of exam.subjects) {
    const source = SUBJECT_SOURCE_MAP[subject.name];
    if (!source) {
      // No copy source — create chapters from domain names later; skip for now
      continue;
    }

    // Get source subject + its chapters
    const srcExam = await prisma.exam.findFirst({ where: { name: source.exam } });
    const srcSubject = await prisma.subject.findFirst({
      where: { examId: srcExam.id, name: source.subject },
      include: { chapters: true },
    });
    if (!srcSubject || srcSubject.chapters.length === 0) continue;

    for (const srcChapter of srcSubject.chapters) {
      // Create a chapter with the same name in the new exam subject
      const newChapter = await prisma.chapter.create({
        data: {
          name: srcChapter.name,
          subjectId: subject.id,
          order: srcChapter.order,
        },
      });
      totalChaptersCreated++;

      // Copy all questions from source chapter
      const srcQuestions = await prisma.question.findMany({ where: { chapterId: srcChapter.id } });
      if (srcQuestions.length === 0) continue;

      for (const q of srcQuestions) {
        await prisma.question.create({
          data: {
            chapterId: newChapter.id,
            conceptId: q.conceptId,
            text: q.text,
            options: q.options,
            correctOption: q.correctOption,
            explanation: q.explanation,
            difficulty: q.difficulty,
            tags: [...q.tags, 'copied:common'],
            isActive: true,
          },
        });
        totalQuestionsCopied++;
      }
    }
    console.log(`${exam.name}/${subject.name}: copied ${srcSubject.chapters.length} chapters`);
  }
}

console.log(`\n=== DONE ===`);
console.log(`Chapters created: ${totalChaptersCreated}`);
console.log(`Questions copied: ${totalQuestionsCopied}`);
await prisma.$disconnect();