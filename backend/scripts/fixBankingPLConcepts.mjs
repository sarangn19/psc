/**
 * fixBankingPLConcepts.mjs
 * ------------------------
 * Re-tags active questions in banking exams' "Profit & Loss" chapters to the
 * proper taxonomy concept: #7135 CONCEPT "Cost Price and Selling Price"
 * (under SUBJECT Quantitative Aptitude > DOMAIN Arithmetic > TOPIC Profit and Loss).
 *
 * Before: questions pointed to #357 TOPIC Percentage (wrong topic) or
 * #355 SUBJECT Quantitative Aptitude (subject-level fallback, useless for
 * focused practice).
 *
 * Usage:
 *   node backend/scripts/fixBankingPLConcepts.mjs --dry-run
 *   node backend/scripts/fixBankingPLConcepts.mjs
 *   node backend/scripts/fixBankingPLConcepts.mjs rollback
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const ROLLBACK_FILE = path.resolve(__dirname, 'banking_pl_concept_rollback.json');
const TARGET_CONCEPT_ID = 7135;
const BANKING_EXAMS = [
  'IBPS PO', 'IBPS Clerk', 'SBI PO', 'SBI Clerk',
  'IBPS RRB Officer Scale I', 'IBPS RRB Office Assistant', 'RBI Grade B',
];

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

const prisma = await connect();

if (process.argv.includes('rollback')) {
  if (!fs.existsSync(ROLLBACK_FILE)) { console.log('No rollback file found.'); process.exit(0); }
  const rows = JSON.parse(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  let n = 0;
  for (const r of rows) {
    await prisma.question.update({ where: { id: r.id }, data: { conceptId: r.oldConceptId } });
    n++;
  }
  console.log(`Restored conceptId on ${n} questions`);
  await prisma.$disconnect();
  process.exit(0);
}

const target = await prisma.taxonomyNode.findUnique({
  where: { id: TARGET_CONCEPT_ID },
  select: { id: true, level: true, nameEnglish: true },
});
if (!target || target.level !== 'CONCEPT') {
  console.error(`Target concept #${TARGET_CONCEPT_ID} missing or not CONCEPT level. Aborting.`);
  process.exit(1);
}
console.log(`Target concept: #${target.id} ${target.nameEnglish}`);

const chapters = await prisma.chapter.findMany({
  where: { name: { contains: 'Profit' }, subject: { exam: { name: { in: BANKING_EXAMS } } } },
  select: { id: true, subject: { select: { exam: { select: { name: true } } } } },
});
console.log(`Banking P&L chapters: ${chapters.length}`);

const fixes = [];
for (const ch of chapters) {
  const qs = await prisma.question.findMany({
    where: { chapterId: ch.id, isActive: true, conceptId: { not: TARGET_CONCEPT_ID } },
    select: { id: true, text: true, conceptId: true, concept: { select: { nameEnglish: true, level: true } } },
  });
  for (const q of qs) {
    fixes.push({
      id: q.id,
      exam: ch.subject.exam.name,
      oldConceptId: q.conceptId,
      oldConcept: q.concept ? `${q.concept.level}:${q.concept.nameEnglish}` : 'NULL',
      text: q.text.replace(/\s+/g, ' ').slice(0, 80),
    });
  }
}

console.log(`\nQuestions to re-tag: ${fixes.length}`);
for (const f of fixes) console.log(`  [${f.exam}] ${f.oldConcept} -> CONCEPT:Cost Price and Selling Price\n    ${f.text}`);

if (process.argv.includes('--dry-run')) { console.log('\n(dry run - nothing changed)'); await prisma.$disconnect(); process.exit(0); }

for (const f of fixes) {
  await prisma.question.update({ where: { id: f.id }, data: { conceptId: TARGET_CONCEPT_ID } });
}
fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(fixes, null, 2));
console.log(`\nRe-tagged ${fixes.length} questions (rollback: node backend/scripts/fixBankingPLConcepts.mjs rollback)`);

const after = await prisma.$queryRaw`
  SELECT e.name AS exam, t.nameEnglish AS concept, COUNT(*)::int AS c
  FROM questions q
  JOIN chapters ch ON ch.id = q."chapterId"
  JOIN subjects s ON s.id = ch."subjectId"
  JOIN exams e ON e.id = s."examId"
  LEFT JOIN taxonomy_nodes t ON t.id = q."conceptId"
  WHERE ch.name LIKE '%Profit%' AND e.name = ANY(${BANKING_EXAMS}) AND q."isActive"
  GROUP BY e.name, t.nameEnglish
  ORDER BY e.name`;
console.log('\nAfter fix (active, per exam):');
for (const r of after) console.log(`  ${r.exam}: ${r.concept} (${r.c})`);

await prisma.$disconnect();
process.exit(0);
