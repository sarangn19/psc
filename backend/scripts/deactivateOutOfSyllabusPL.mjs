/**
 * deactivateOutOfSyllabusPL.mjs
 * -----------------------------
 * Deactivates (isActive=false) questions that sit inside "Profit & Loss"
 * chapters but are NOT arithmetic Profit & Loss (nursing, electrical/
 * civil/mechanical engineering, partnership accounts, consignment,
 * income-tax, CVP/breakeven). They were keyword-mapped there by earlier
 * imports ("loss"/"profit"/"cost price" appeared in the text) and then
 * copied into every exam's P&L chapter.
 *
 * Scope: only chapters whose name matches /profit/i. Nothing outside
 * P&L chapters is touched. Deactivation is reversible (isActive only,
 * no deletes).
 *
 * Usage:
 *   node backend/scripts/deactivateOutOfSyllabusPL.mjs --dry-run
 *   node backend/scripts/deactivateOutOfSyllabusPL.mjs
 *   node backend/scripts/deactivateOutOfSyllabusPL.mjs rollback
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

const prisma = new PrismaClient();
const ROLLBACK_FILE = path.resolve(__dirname, 'pl_oos_deactivated_ids.json');

// Out-of-syllabus signatures (matched case-insensitively against question text).
const OUT_OF_SYLLABUS = [
  ['sale-or-return accounting', /sale or return basis/i],
  ['obstetrics (products of conception)', /involuntary loss of products of conception/i],
  ['electrical machines (transformer)', /transformer is working at its maximum efficiency/i],
  ['civil engineering (fluid flow head loss)', /fluid flow, point P is at a higher elevation/i],
  ['partnership profit-sharing ratio', /X, Y and Z are partners in a business/i],
  ['partnership dissolution method', /Maximum Possible Loss method/i],
  ['electrical engineering (hysteresis)', /hysteresis loop of a magnetic material/i],
  ['power electronics (switching loss)', /power electronics switch/i],
  ['cost accounting (P/V ratio)', /P\/V Ratio/i],
  ['electrical machines (pole shoe)', /pole shoe in DC generator/i],
  ['thermodynamics (irreversible process)', /irreversible process, there is a/i],
  ['accounts (consignment stock)', /unsold stock in the consignment accounts/i],
  ['cost accounting (breakeven)', /breakeven point/i],
  ['income-tax exemptions', /exempted from computation of Income Tax/i],
];

async function main() {
  const ROLLBACK = process.argv.includes('rollback');
  const DRY = process.argv.includes('--dry-run');

  if (ROLLBACK) {
    if (!fs.existsSync(ROLLBACK_FILE)) { console.log('No rollback file found.'); process.exit(0); }
    const ids = JSON.parse(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
    const res = await prisma.question.updateMany({
      where: { id: { in: ids }, isActive: false },
      data: { isActive: true },
    });
    console.log(`Restored ${res.count} questions to active`);
    await prisma.$disconnect();
    return;
  }

  const chapters = await prisma.chapter.findMany({
    where: { name: { contains: 'Profit' } },
    select: { id: true, name: true, subject: { select: { exam: { select: { name: true } } } } },
  });

  const hits = [];
  for (const ch of chapters) {
    const questions = await prisma.question.findMany({
      where: { chapterId: ch.id },
      select: { id: true, text: true, isActive: true },
    });
    for (const q of questions) {
      const label = OUT_OF_SYLLABUS.find(([, re]) => re.test(q.text || ''));
      if (label && q.isActive) {
        hits.push({ id: q.id, exam: ch.subject.exam.name, chapter: ch.name, kind: label[0], text: (q.text || '').replace(/\s+/g, ' ').slice(0, 90) });
      }
    }
  }

  console.log(`Chapters scanned : ${chapters.length}`);
  console.log(`Active OOS hits  : ${hits.length}`);
  for (const h of hits) console.log(`  [${h.exam}] ${h.kind}\n    ${h.text}`);

  if (DRY) { console.log('\n(dry run - nothing changed)'); await prisma.$disconnect(); return; }

  const ids = hits.map((h) => h.id);
  const res = ids.length
    ? await prisma.question.updateMany({ where: { id: { in: ids }, isActive: true }, data: { isActive: false } })
    : { count: 0 };
  fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(ids, null, 2));
  console.log(`\nDeactivated ${res.count} questions (rollback: node backend/scripts/deactivateOutOfSyllabusPL.mjs rollback)`);

  const perChapter = await prisma.$queryRaw`
    SELECT e.name AS exam, c.name AS chapter,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE q."isActive")::int AS active
    FROM questions q
    JOIN chapters c ON c.id = q."chapterId"
    JOIN subjects s ON s.id = c."subjectId"
    JOIN exams e ON e.id = s."examId"
    WHERE c.name LIKE '%Profit%'
    GROUP BY e.name, c.name
    ORDER BY e.name`;
  console.log('\nPer-chapter after fix:');
  for (const r of perChapter) console.log(`  ${r.exam}: ${r.active}/${r.total} active`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
