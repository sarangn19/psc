import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  // 1. Find the LDC exam
  const ldExam = await prisma.exam.findFirst({ where: { name: { contains: 'LDC', mode: 'insensitive' } } });

  if (!ldExam) {
    console.log('ERROR: No LDC exam found.');
    // List all exams as fallback
    const allExams = await prisma.exam.findMany({ include: { _count: { select: { subjects: true } } } });
    console.log('Available exams:', JSON.stringify(allExams, null, 2));
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Found LDC Exam: "${ldExam.name}" (id: ${ldExam.id})`);
  console.log('');

  // 2. Get all subjects under LDC
  const subjects = await prisma.subject.findMany({ where: { examId: ldExam.id } });
  const subjectIds = subjects.map(s => s.id);

  // 3. Get all chapters in those subjects with question counts
  const chapters = await prisma.chapter.findMany({
    where: { subjectId: { in: subjectIds } },
    include: {
      _count: { select: { questions: true } },
      subject: { select: { name: true } },
    },

  });

  // 4. Build the table
  const subjectMap = {};
  for (const s of subjects) subjectMap[s.id] = s.name;

  let totalQuestions = 0;
  let chaptersWithQuestions = 0;
  const criticalGaps = [];

  // Sort chapters by question count ascending
  chapters.sort((a, b) => a._count.questions - b._count.questions);

  console.log('=== QUESTION BANK GAP ANALYSIS: LDC EXAM ===');
  console.log('');
  console.log('| # | Subject                | Chapter                           | Questions |');
  console.log('|---|------------------------|-----------------------------------|-----------|');

  let idx = 0;
  for (const ch of chapters) {
    idx++;
    const qCount = ch._count.questions;
    totalQuestions += qCount;
    if (qCount > 0) chaptersWithQuestions++;

    const marker = qCount < 50 ? ' <-- CRITICAL GAP' : '';
    const subName = (subjectMap[ch.subjectId] || ch.subjectId).padEnd(22);
    const chName = ch.name.padEnd(33);

    console.log(`| ${String(idx).padStart(2)} | ${subName} | ${chName} | ${String(qCount).padStart(9)} |${marker}`);

    if (qCount < 50) {
      criticalGaps.push({ subject: subjectMap[ch.subjectId], chapter: ch.name, count: qCount });
    }
  }

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Total chapters (in LDC exam):          ${chapters.length}`);
  console.log(`Chapters with questions (>0):          ${chaptersWithQuestions}`);
  console.log(`Chapters with ZERO questions:          ${chapters.length - chaptersWithQuestions}`);
  console.log(`Total questions (across all chapters): ${totalQuestions}`);
  console.log(`Avg questions per chapter:             ${chapters.length > 0 ? (totalQuestions / chapters.length).toFixed(1) : 0}`);
  console.log('');

  if (criticalGaps.length > 0) {
    console.log(`=== CRITICAL GAPS (< 50 questions): ${criticalGaps.length} chapters ===`);
    console.log('');
    console.log('| Subject                | Chapter                           | Questions |');
    console.log('|------------------------|-----------------------------------|-----------|');
    for (const g of criticalGaps) {
      console.log(`| ${(g.subject || '').padEnd(22)} | ${(g.chapter || '').padEnd(33)} | ${String(g.count).padStart(9)} |`);
    }
  } else {
    console.log('No critical gaps found (all chapters have 50+ questions).');
  }

} catch (err) {
  console.error('FATAL:', err.message);
} finally {
  await prisma.$disconnect();
}
