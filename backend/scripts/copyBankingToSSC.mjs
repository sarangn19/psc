import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

async function connect() {
  try {
    const p = new PrismaClient();
    await p.$queryRaw`SELECT 1`;
    console.log('(connected via DATABASE_URL pooler)');
    return p;
  } catch {
    const p = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    await p.$queryRaw`SELECT 1`;
    console.log('(connected via DIRECT_URL)');
    return p;
  }
}

const DRY = process.argv.includes('--dry-run');
const SSC_EXAMS = ['SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC GD Constable'];
const SOURCES = [
  'IBPS PO', 'IBPS Clerk', 'SBI PO', 'SBI Clerk',
  'IBPS RRB Officer Scale I', 'IBPS RRB Office Assistant', 'RBI Grade B',
];
const BATCH_TAG = 'copy:banking_to_ssc';
const normalizeText = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

const prisma = await connect();

if (process.argv.includes('rollback')) {
  const del = await prisma.question.deleteMany({ where: { tags: { has: BATCH_TAG } } });
  console.log(`Rolled back ${del.count} copied questions (tag ${BATCH_TAG})`);
  await prisma.$disconnect();
  process.exit(0);
}

// Build source chapter map: name -> Set of question records (dedup across all banking exams by normalized text)
const srcChapters = await prisma.chapter.findMany({
  where: { subject: { exam: { name: { in: SOURCES } } } },
  select: {
    id: true,
    name: true,
    subject: { select: { exam: { select: { name: true } }, name: true } },
  },
});
const srcByName = new Map();
for (const ch of srcChapters) {
  if (!srcByName.has(ch.name)) srcByName.set(ch.name, ch);
}

// For each source chapter name, gather unique questions across all banking exams
const srcQuestions = new Map(); // chapterName -> Map(normText -> question)
for (const ch of srcChapters) {
  if (!srcByName.get(ch.name)?.id) continue;
  const qs = await prisma.question.findMany({
    where: { chapterId: ch.id, isActive: true },
    select: {
      text: true, options: true, correctOption: true,
      explanation: true, difficulty: true, tags: true, conceptId: true,
    },
  });
  if (!srcQuestions.has(ch.name)) srcQuestions.set(ch.name, new Map());
  const m = srcQuestions.get(ch.name);
  for (const q of qs) {
    const norm = normalizeText(q.text);
    if (!m.has(norm)) m.set(norm, q);
  }
}
console.log(`Source: ${srcChapters.length} banking chapters across ${SOURCES.length} exams`);
for (const [name, m] of srcQuestions) {
  // nothing yet
}

const createdIds = [];
const report = [];

for (const examName of SSC_EXAMS) {
  const exam = await prisma.exam.findFirst({
    where: { name: examName },
    include: { subjects: { include: { chapters: { select: { id: true, name: true } } } } },
  });
  if (!exam) { console.error(`Exam "${examName}" not found, skipping.`); continue; }

  // Build target chapter map name -> id
  const tgtByName = new Map();
  for (const s of exam.subjects) {
    for (const ch of s.chapters) tgtByName.set(ch.name, ch.id);
  }

  let examTotal = 0;
  const chapterReport = [];

  for (const [chName, tgtId] of tgtByName) {
    const src = srcQuestions.get(chName);
    if (!src || src.size === 0) continue;

    // Existing texts in target chapter (for dedup/idempotency)
    const existing = await prisma.question.findMany({ where: { chapterId: tgtId }, select: { text: true } });
    const seen = new Set(existing.map((q) => normalizeText(q.text)));

    const rows = [];
    for (const [norm, q] of src) {
      if (seen.has(norm)) continue;
      seen.add(norm);
      rows.push({
        chapterId: tgtId,
        conceptId: q.conceptId,
        text: q.text,
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        difficulty: q.difficulty,
        tags: [...q.tags, BATCH_TAG, `copy:from_${'banking'}`],
        isActive: true,
      });
    }
    if (rows.length === 0) continue;

    if (!DRY) {
      for (let i = 0; i < rows.length; i += 100) {
        await prisma.question.createMany({ data: rows.slice(i, i + 100) });
      }
      const ids = await prisma.question.findMany({
        where: { chapterId: tgtId, tags: { has: BATCH_TAG } },
        select: { id: true },
      });
      // Only track new ones - but simpler: track all with tag for this chapter created now
      // We'll collect all ids at the end
    }
    examTotal += rows.length;
    chapterReport.push(`${chName}=${rows.length}`);
  }

  if (chapterReport.length > 0) {
    console.log(`\n${examName}: +${examTotal} across ${chapterReport.length} chapters`);
    console.log('  ' + chapterReport.join(', '));
    report.push({ examName, examTotal, chapters: chapterReport.length });
  } else {
    console.log(`\n${examName}: no matching chapters with questions found.`);
  }
}

if (!DRY) {
  const allIds = await prisma.question.findMany({ where: { tags: { has: BATCH_TAG } }, select: { id: true } });
  fs.writeFileSync(path.resolve(__dirname, 'copyBankingToSSC_rollback.json'), JSON.stringify(allIds.map((x) => x.id), null, 2));
  console.log(`\nSaved ${allIds.length} ids to copyBankingToSSC_rollback.json`);
  console.log('Rollback: node backend/scripts/copyBankingToSSC.mjs rollback');
} else {
  console.log('\n(dry-run: no rows written)');
}

console.log('\n=== Summary ===');
for (const r of report) console.log(`${r.examName}: +${r.examTotal} questions across ${r.chapters} chapters`);

await prisma.$disconnect();
