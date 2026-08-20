import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const bankingExamNames = [
  'IBPS PO', 'IBPS Clerk', 'SBI PO', 'SBI Clerk',
  'RBI Grade B', 'IBPS RRB Officer Scale I', 'IBPS RRB Office Assistant'
];

const chapterName = 'Current Affairs (Appointments)';

// Get source from IBPS PO
const ibpsExam = await prisma.exam.findFirst({ where: { name: 'IBPS PO' } });
let sourceChapter = null;
const ibpsSubjects = await prisma.subject.findMany({ where: { examId: ibpsExam.id } });
for (const sub of ibpsSubjects) {
  const ch = await prisma.chapter.findFirst({ where: { subjectId: sub.id, name: chapterName } });
  if (ch) { sourceChapter = ch; break; }
}
if (!sourceChapter) { console.log('Source chapter not found'); process.exit(1); }

const sourceQuestions = await prisma.question.findMany({ where: { chapterId: sourceChapter.id } });
console.log(`IBPS PO has ${sourceQuestions.length} questions`);

for (const examName of bankingExamNames) {
  if (examName === 'IBPS PO') continue;
  
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
        tags: [...q.tags, 'copied:ibps-po'],
        isActive: true
      }
    });
    inserted++;
  }
  console.log(`${examName}: +${inserted}`);
}

await prisma.$disconnect();
console.log('Done!');
