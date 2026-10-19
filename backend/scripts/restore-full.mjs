/**
 * restore-full.mjs — restores EVERY model from a backup folder.
 * The pre-existing restore-backup.mjs only handles 7 models and silently drops
 * taxonomyNodes, attempts, concept stats, userExams, sessions and activities.
 *
 * Usage: node backend/scripts/restore-full.mjs backend/backups/YYYY-MM-DD
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2].trim();
}

const prisma = new PrismaClient();
const backupDir = process.argv[2];
if (!backupDir) { console.error('Usage: node backend/scripts/restore-full.mjs <backupDir>'); process.exit(1); }

const load = (name) => {
  const p = path.join(backupDir, name);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  return JSON.parse(raw);
};

// children before parents when deleting; parents before children when inserting
async function clearAll() {
  await prisma.newsView.deleteMany({});
  await prisma.newsItem.deleteMany({});
  await prisma.flaggedQuestion.deleteMany({});
  await prisma.userActivity.deleteMany({});
  await prisma.userConceptStat.deleteMany({});
  await prisma.pocketItem.deleteMany({}).catch(() => {});
  await prisma.pocketSession.deleteMany({}).catch(() => {});
  await prisma.adaptiveItem.deleteMany({});
  await prisma.questionAttempt.deleteMany({});
  await prisma.adaptiveSession.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.userChapter.deleteMany({});
  await prisma.userExam.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.chapter.deleteMany({});
  await prisma.taxonomyNode.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.exam.deleteMany({});
}

// Topologically sort taxonomy nodes so parents land before children.
// Any node whose parent is missing or cyclic gets parentId nulled rather than
// aborting the whole restore.
function topoSortTaxonomy(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const remaining = new Map(nodes.map((n) => [n.id, { ...n }]));
  const inserted = new Set();
  const ordered = [];
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const [id, n] of [...remaining.entries()]) {
      if (n.parentId == null || inserted.has(n.parentId) || !byId.has(n.parentId)) {
        ordered.push(n);
        inserted.add(id);
        remaining.delete(id);
        progress = true;
      }
    }
  }
  // leftovers: cycles — break the cycle by nulling parentId
  for (const n of remaining.values()) { n.parentId = null; ordered.push(n); }
  return ordered;
}

async function insertBatched(model, rows, size = 500, label = model) {
  let done = 0;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    await prisma[model].createMany({ data: batch, skipDuplicates: true });
    done += batch.length;
    if (done % 5000 === 0 || done === rows.length) process.stdout.write(`  ${label}: ${done}/${rows.length}\n`);
  }
}

async function restore() {
  console.log(`Restoring FULL backup from: ${backupDir}`);

  const exams = load('exam.json');
  const subjects = load('subject.json');
  const chapters = load('chapter.json');
  const questions = load('question.json');
  const users = load('user.json');
  const taxonomyNodes = load('taxonomyNode.json');
  const userExams = load('userExam.json');
  const userChapters = load('userChapter.json');
  const flaggedQuestions = load('flaggedQuestion.json');
  const questionAttempts = load('questionAttempt.json');
  const adaptiveSessions = load('adaptiveSession.json');
  const adaptiveItems = load('adaptiveItem.json');
  const userConceptStats = load('userConceptStat.json');
  const userActivities = load('userActivity.json');
  const newsItems = load('newsItem.json');
  const newsViews = load('newsView.json');

  console.log(`  exams=${exams.length} subjects=${subjects.length} taxonomy=${taxonomyNodes.length} chapters=${chapters.length} questions=${questions.length} users=${users.length}`);
  console.log(`  userExams=${userExams.length} userChapters=${userChapters.length} attempts=${questionAttempts.length} sessions=${adaptiveSessions.length} items=${adaptiveItems.length} stats=${userConceptStats.length} activities=${userActivities.length}`);

  console.log('Clearing existing data...');
  await clearAll();

  await insertBatched('exam', exams, 500, 'exams');
  await insertBatched('subject', subjects, 500, 'subjects');

  const sortedTaxonomy = topoSortTaxonomy(taxonomyNodes);
  await insertBatched('taxonomyNode', sortedTaxonomy, 1000, 'taxonomy');

  await insertBatched('chapter', chapters, 500, 'chapters');
  await insertBatched('user', users, 500, 'users');
  await insertBatched('userExam', userExams, 500, 'userExams');
  await insertBatched('userChapter', userChapters, 500, 'userChapters');

  const conceptIds = new Set((await prisma.taxonomyNode.findMany({ select: { id: true } })).map((n) => n.id));
  const cleanedQuestions = questions.map((q) => ({
    ...q,
    conceptId: q.conceptId != null && conceptIds.has(q.conceptId) ? q.conceptId : null,
  }));
  await insertBatched('question', cleanedQuestions, 500, 'questions');

  await insertBatched('adaptiveSession', adaptiveSessions, 500, 'adaptiveSessions');
  await insertBatched('questionAttempt', questionAttempts, 500, 'questionAttempts');
  await insertBatched('adaptiveItem', adaptiveItems, 500, 'adaptiveItems');
  await insertBatched('userConceptStat', userConceptStats, 500, 'userConceptStats');
  await insertBatched('userActivity', userActivities, 500, 'userActivities');
  await insertBatched('flaggedQuestion', flaggedQuestions, 500, 'flaggedQuestions');
  await insertBatched('newsItem', newsItems, 500, 'newsItems');
  await insertBatched('newsView', newsViews, 500, 'newsViews');

  const counts = {
    exam: await prisma.exam.count(),
    subject: await prisma.subject.count(),
    taxonomyNode: await prisma.taxonomyNode.count(),
    chapter: await prisma.chapter.count(),
    question: await prisma.question.count(),
    user: await prisma.user.count(),
    userExam: await prisma.userExam.count(),
    userChapter: await prisma.userChapter.count(),
    questionAttempt: await prisma.questionAttempt.count(),
    adaptiveSession: await prisma.adaptiveSession.count(),
    adaptiveItem: await prisma.adaptiveItem.count(),
    userConceptStat: await prisma.userConceptStat.count(),
    userActivity: await prisma.userActivity.count(),
    flaggedQuestion: await prisma.flaggedQuestion.count(),
  };
  console.log('\nRestore complete:', JSON.stringify(counts, null, 2));
}

restore().catch((e) => { console.error('RESTORE FAILED:', e); process.exit(1); }).finally(() => prisma.$disconnect());
