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
    return p;
  } catch {
    const p = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    await p.$queryRaw`SELECT 1`;
    console.log('(connected via DIRECT_URL)');
    return p;
  }
}

const DRY = process.argv.includes('--dry-run');
const ROLLBACK_FILE = path.resolve(__dirname, 'eng_concept_repoint_rollback.json');

// English batch questions mis-filed into the Mental Ability taxonomy subtree.
// Targets are CONCEPT-level nodes under English > English Grammar > Error Correction.
const PLAN = [
  { tag: 'gen:ssc_errorspot_gen1', from: 1616, to: 8100 },
  { tag: 'gen:ssc_spellings_gen1', from: 8072, to: 8101 },
];

async function pathOf(p, id) {
  let node = await p.taxonomyNode.findUnique({ where: { id } });
  if (!node) return `#${id} MISSING`;
  const chain = [];
  while (node) {
    chain.unshift(`${node.nameEnglish}(${node.level})`);
    node = node.parentId ? await p.taxonomyNode.findUnique({ where: { id: node.parentId } }) : null;
  }
  return chain.join(' > ');
}

const p = await connect();
const rollback = [];

for (const step of PLAN) {
  const rows = await p.question.findMany({
    where: { tags: { has: step.tag }, conceptId: step.from, isActive: true },
    select: { id: true, text: true, conceptId: true, chapter: { select: { name: true, subject: { select: { name: true, exam: { select: { name: true } } } } } } },
  });
  const attempts = await p.questionAttempt.count({ where: { questionId: { in: rows.map((r) => r.id) } } });
  console.log(`\n[${step.tag}] concept ${step.from} -> ${step.to}: ${rows.length} questions, ${attempts} recorded attempts`);
  console.log(`  from: ${await pathOf(p, step.from)}`);
  console.log(`  to:   ${await pathOf(p, step.to)}`);
  for (const r of rows.slice(0, 3)) console.log(`  e.g. [${r.chapter.subject.exam.name} > ${r.chapter.name}] ${r.text.slice(0, 80)}`);

  if (rows.length === 0) continue;
  if (attempts > 0) console.log(`  note: ${attempts} attempts exist — userConceptStat rows keyed to ${step.from} are NOT migrated (attempt history preserved as-is)`);

  if (!DRY) {
    await p.question.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { conceptId: step.to },
    });
    for (const r of rows) rollback.push({ id: r.id, oldConceptId: step.from, newConceptId: step.to });
    console.log(`  updated ${rows.length}`);
  } else {
    console.log(`  DRY-RUN: would update ${rows.length}`);
  }
}

if (!DRY && rollback.length > 0) {
  fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2));
  console.log(`\nRollback saved: ${ROLLBACK_FILE} (${rollback.length} rows)`);
  console.log('To rollback: for each row set conceptId back to oldConceptId.');
} else if (DRY) {
  console.log('\nDRY-RUN complete — no changes made.');
}

await p.$disconnect();
