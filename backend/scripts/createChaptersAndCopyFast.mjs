import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

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

const originalPscNames = [
  'LDC (Lower Division Clerk)', 'LGS (Last Grade Servant)',
  'PSC Degree Level', 'Police Constable',
  'HSST (Higher Secondary School Teacher)', 'VEO (Village Extension Officer)',
];

// Preload all source chapters + their question counts for performance
const sourceCache = new Map(); // key: `${exam}|${subject}`

async function getSourceChapters(examName, subjectName) {
  const key = `${examName}|${subjectName}`;
  if (sourceCache.has(key)) return sourceCache.get(key);
  const exam = await prisma.exam.findFirst({ where: { name: examName } });
  if (!exam) { sourceCache.set(key, null); return null; }
  const subject = await prisma.subject.findFirst({
    where: { examId: exam.id, name: subjectName },
    include: { chapters: true },
  });
  sourceCache.set(key, subject?.chapters || null);
  return sourceCache.get(key);
}

const newExams = await prisma.exam.findMany({
  where: { category: 'PSC' },
  include: { subjects: true },
  orderBy: { createdAt: 'asc' },
});

let totalChapters = 0;
let totalQuestions = 0;

for (const exam of newExams) {
  if (originalPscNames.includes(exam.name)) continue;

  // Skip exams that already got chapters (have any chapter)
  const anyChapter = await prisma.chapter.findFirst({ where: { subject: { examId: exam.id } }, select: { id: true } });
  if (anyChapter) {
    console.log(`⏭  ${exam.name}: already has chapters, skipping`);
    continue;
  }

  let examChapters = 0;
  let examQuestions = 0;

  for (const subject of exam.subjects) {
    const source = SUBJECT_SOURCE_MAP[subject.name];
    if (!source) continue;

    const srcChapters = await getSourceChapters(source.exam, source.subject);
    if (!srcChapters || srcChapters.length === 0) continue;

    // Create all chapters in one batch
    const createdChapters = await prisma.chapter.createManyAndReturn({
      data: srcChapters.map((c, i) => ({
        name: c.name,
        subjectId: subject.id,
        order: i,
      })),
    });
    examChapters += createdChapters.length;

    // For each source chapter, fetch its questions and batch-copy
    for (let i = 0; i < srcChapters.length; i++) {
      const srcChapter = srcChapters[i];
      const newChapter = createdChapters[i];
      const srcQs = await prisma.question.findMany({
        where: { chapterId: srcChapter.id },
        select: {
          conceptId: true, text: true, options: true, correctOption: true,
          explanation: true, difficulty: true, tags: true, isActive: true,
        },
      });
      if (srcQs.length === 0) continue;

      // Insert in chunks of 500
      for (let j = 0; j < srcQs.length; j += 500) {
        const chunk = srcQs.slice(j, j + 500).map((q) => ({
          chapterId: newChapter.id,
          conceptId: q.conceptId,
          text: q.text,
          options: q.options,
          correctOption: q.correctOption,
          explanation: q.explanation,
          difficulty: q.difficulty,
          tags: [...q.tags, 'copied:common'],
          isActive: q.isActive,
        }));
        const res = await prisma.question.createMany({ data: chunk });
        examQuestions += res.count;
      }
    }
  }

  console.log(`${exam.name}: +${examChapters} chapters, +${examQuestions} questions`);
  totalChapters += examChapters;
  totalQuestions += examQuestions;
}

console.log(`\n=== DONE ===`);
console.log(`Total chapters created: ${totalChapters}`);
console.log(`Total questions copied: ${totalQuestions}`);
await prisma.$disconnect();