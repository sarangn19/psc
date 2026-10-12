import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const backupDir = process.argv[2] || path.resolve(__dirname, '..', 'backups', '2026-10-04');

const load = (name) => JSON.parse(fs.readFileSync(path.join(backupDir, name), 'utf8'));

async function restore() {
  console.log(`Restoring from: ${backupDir}`);

  const exams = load('exam.json');
  const subjects = load('subject.json');
  const chapters = load('chapter.json');
  const questions = load('question.json');
  const users = load('user.json');
  const userChapters = load('userChapter.json');
  const flaggedQuestions = load('flaggedQuestion.json');

  console.log(`  exams: ${exams.length}, subjects: ${subjects.length}, chapters: ${chapters.length}, questions: ${questions.length}, users: ${users.length}`);

  await prisma.flaggedQuestion.deleteMany({});
  await prisma.userChapter.deleteMany({});
  await prisma.questionReport.deleteMany({});
  await prisma.questionAttempt.deleteMany({});
  await prisma.adaptiveItem.deleteMany({});
  await prisma.adaptiveSession.deleteMany({});
  await prisma.userActivity.deleteMany({});
  await prisma.newsView.deleteMany({});
  await prisma.newsItem.deleteMany({});
  await prisma.userConceptStat.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.chapter.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.exam.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('  cleared existing data');

  await prisma.exam.createMany({ data: exams, skipDuplicates: true });
  console.log('  exams done');

  await prisma.subject.createMany({ data: subjects, skipDuplicates: true });
  console.log('  subjects done');

  await prisma.chapter.createMany({ data: chapters, skipDuplicates: true });
  console.log('  chapters done');

  await prisma.user.createMany({ data: users, skipDuplicates: true });
  console.log('  users done');

  const existingConceptIds = new Set((await prisma.taxonomyNode.findMany({ select: { id: true } })).map((n) => n.id));
  const cleanedQuestions = questions.map((q) => ({
    ...q,
    conceptId: q.conceptId != null && existingConceptIds.has(q.conceptId) ? q.conceptId : null,
  }));

  const BATCH = 500;
  for (let i = 0; i < cleanedQuestions.length; i += BATCH) {
    const batch = cleanedQuestions.slice(i, i + BATCH);
    await prisma.question.createMany({ data: batch, skipDuplicates: true });
    if ((i / BATCH) % 10 === 0) console.log(`  questions: ${i + batch.length}/${cleanedQuestions.length}`);
  }
  console.log('  questions done');

  await prisma.userChapter.createMany({ data: userChapters, skipDuplicates: true });
  console.log('  userChapters done');

  await prisma.flaggedQuestion.createMany({ data: flaggedQuestions, skipDuplicates: true });
  console.log('  flaggedQuestions done');

  const counts = {
    exams: await prisma.exam.count(),
    subjects: await prisma.subject.count(),
    chapters: await prisma.chapter.count(),
    questions: await prisma.question.count(),
    users: await prisma.user.count(),
  };
  console.log('\nRestore complete:', JSON.stringify(counts, null, 2));
}

restore().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
