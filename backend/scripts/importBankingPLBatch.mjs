import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const fileArg = process.argv.find((a) => a.endsWith('.json') && !a.startsWith('-') && !process.argv[process.argv.indexOf(a) - 1]?.startsWith('-'));
const BASE = path.basename(fileArg || 'banking_pl_gen2.json', '.json');
const ROLLBACK_FILE = path.resolve(__dirname, `${BASE}_rollback.json`);
const BATCH_TAG = `gen:${BASE}`;
const BANKING_EXAMS = [
  'IBPS PO', 'IBPS Clerk', 'SBI PO', 'SBI Clerk',
  'IBPS RRB Officer Scale I', 'IBPS RRB Office Assistant', 'RBI Grade B',
];
const EXAMS = process.env.EXAM_FILTER
  ? process.env.EXAM_FILTER.split(',').map((s) => s.trim()).filter(Boolean)
  : BANKING_EXAMS;
const CHAPTER_FILTER = process.env.CHAPTER_FILTER || 'Profit';
const TOPIC_CONCEPT = JSON.parse(
  process.env.CONCEPT_MAP || '{"cp_sp":7135,"unit_rate":7135,"dishonest":7135,"discount":7138}'
);

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

const normalizeText = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const prisma = await connect();

if (process.argv.includes('rollback')) {
  if (!fs.existsSync(ROLLBACK_FILE)) { console.log('No rollback file found.'); process.exit(0); }
  const ids = JSON.parse(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  const del = await prisma.question.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${del.count} imported questions (rollback ${BATCH_TAG})`);
  await prisma.$disconnect();
  process.exit(0);
}

const filePath = path.resolve(fileArg || path.join(__dirname, `${BASE}.json`));
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
console.log(`Batch file: ${path.basename(filePath)} (${data.length} items) tag=${BATCH_TAG}`);

const problems = [];
const counts = { d: {}, t: {} };
data.forEach((r, i) => {
  const tag = `#${i + 1}`;
  if (!r.q || typeof r.q !== 'string') problems.push(`${tag} missing q`);
  if (!Array.isArray(r.opts) || r.opts.length !== 4 || r.opts.some((o) => !o)) problems.push(`${tag} opts must be 4 non-empty`);
  if (Array.isArray(r.opts) && new Set(r.opts.map(String)).size !== 4) problems.push(`${tag} duplicate options`);
  if (!Number.isInteger(r.a) || r.a < 0 || r.a > 3) problems.push(`${tag} bad answer index`);
  if (!['EASY', 'MEDIUM', 'HARD'].includes(r.d)) problems.push(`${tag} bad difficulty`);
  if (!Object.hasOwn(TOPIC_CONCEPT, r.t)) problems.push(`${tag} bad topic tag`);
  if (!r.exp || /\n/.test(r.exp)) problems.push(`${tag} exp missing or multiline`);
  counts.d[r.d] = (counts.d[r.d] || 0) + 1;
  counts.t[r.t] = (counts.t[r.t] || 0) + 1;
});
if (problems.length) {
  console.error('VALIDATION FAILED:');
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}
console.log(`Validation OK — difficulty: ${JSON.stringify(counts.d)}, topics: ${JSON.stringify(counts.t)}`);

const chapters = await prisma.chapter.findMany({
  where: {
    ...(process.env.CHAPTER_EXACT === '1' ? { name: CHAPTER_FILTER } : { name: { contains: CHAPTER_FILTER } }),
    subject: { exam: { name: { in: EXAMS } } },
  },
  select: { id: true, name: true, subject: { select: { exam: { select: { name: true } } } } },
});
if (chapters.length !== EXAMS.length) {
  console.error(`Expected ${EXAMS.length} matching '${CHAPTER_FILTER}' chapters (exams: ${EXAMS.join(', ')}), found ${chapters.length}. Aborting.`);
  process.exit(1);
}
const conceptIds = [...new Set(Object.values(TOPIC_CONCEPT))];
const concepts = await prisma.taxonomyNode.findMany({ where: { id: { in: conceptIds } }, select: { id: true, level: true } });
for (const c of concepts) if (c.level !== 'CONCEPT') { console.error(`#${c.id} is not CONCEPT. Aborting.`); process.exit(1); }

if (process.argv.includes('--dry-run')) {
  console.log(`Would import into ${chapters.length} chapters. Concept map: ${JSON.stringify(TOPIC_CONCEPT)}`);
  await prisma.$disconnect();
  process.exit(0);
}

const perChapterTexts = new Map();
for (const ch of chapters) {
  const qs = await prisma.question.findMany({ where: { chapterId: ch.id }, select: { text: true } });
  perChapterTexts.set(ch.id, new Set(qs.map((q) => normalizeText(q.text))));
}

const fileTag = `file:${path.basename(filePath)}`;
let skippedDup = 0;
const perExam = {};

for (const ch of chapters) {
  const examName = ch.subject.exam.name;
  perExam[examName] = 0;
  const seen = perChapterTexts.get(ch.id);
  const rows = [];
  for (const r of data) {
    const norm = normalizeText(r.q);
    if (seen.has(norm)) { skippedDup++; continue; }
    seen.add(norm);
    const shuffled = [...r.opts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    rows.push({
      chapterId: ch.id,
      conceptId: TOPIC_CONCEPT[r.t],
      text: r.q,
      options: shuffled,
      correctOption: shuffled.indexOf(r.opts[r.a]),
      explanation: r.exp,
      difficulty: r.d,
      tags: ['ai:generated', fileTag, BATCH_TAG, `topic:${r.t}`],
      isActive: true,
    });
  }
  for (let i = 0; i < rows.length; i += 100) {
    await prisma.question.createMany({ data: rows.slice(i, i + 100) });
  }
  perExam[examName] = rows.length;
}

const allIds = await prisma.question.findMany({ where: { tags: { has: BATCH_TAG } }, select: { id: true } });
fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(allIds.map((x) => x.id), null, 2));

console.log('Imported per exam:');
for (const [exam, n] of Object.entries(perExam)) console.log(`  ${exam}: +${n}`);
console.log(`Skipped (already in chapter): ${skippedDup}`);
console.log(`Rollback: node backend/scripts/importBankingPLBatch.mjs ${path.basename(filePath)} rollback`);

await prisma.$disconnect();
process.exit(0);
