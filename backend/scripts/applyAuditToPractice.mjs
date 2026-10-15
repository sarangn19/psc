/**
 * applyAuditToPractice.mjs
 * -------------------------
 * Applies the Gemini audit results to the practice pool.
 * Deactivates (isActive=false) every question flagged as invalid
 * or wrong-answer in audit_bad.jsonl, so practice routes
 * (all filter isActive: true) serve only clean questions.
 *
 * Rollback list saved to audit_deactivated_ids.json
 *
 * Usage:
 *   node backend/scripts/applyAuditToPractice.mjs
 *   node backend/scripts/applyAuditToPractice.mjs rollback   # restore deactivated IDs
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
const BAD_FILE = path.resolve(__dirname, 'audit_bad.jsonl');
const ROLLBACK_FILE = path.resolve(__dirname, 'audit_deactivated_ids.json');

async function main() {
  const ROLLBACK = process.argv.includes('rollback');

  if (ROLLBACK) {
    if (!fs.existsSync(ROLLBACK_FILE)) { console.log('No rollback file found.'); process.exit(0); }
    const ids = JSON.parse(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
    const res = await prisma.question.updateMany({
      where: { id: { in: ids }, isActive: false },
      data: { isActive: true },
    });
    console.log(`♻️  Restored ${res.count} questions to active`);
    const active = await prisma.question.count({ where: { isActive: true } });
    console.log(`   Active questions now: ${active}`);
    await prisma.$disconnect();
    return;
  }

  const lines = fs.readFileSync(BAD_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const ids = [...new Set(lines.map(l => { try { return JSON.parse(l).id; } catch { return null; } }).filter(Boolean))];

  const before = await prisma.question.count({ where: { isActive: true } });
  console.log(`📋 Flagged bad questions : ${ids.length}`);
  console.log(`   Active before         : ${before}`);

  const res = await prisma.question.updateMany({
    where: { id: { in: ids }, isActive: true },
    data: { isActive: false },
  });

  fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(ids, null, 2));

  const after = await prisma.question.count({ where: { isActive: true } });
  console.log(`\n✅ Deactivated ${res.count} questions`);
  console.log(`   Active after          : ${after}`);
  console.log(`   Rollback list         : audit_deactivated_ids.json`);
  console.log(`   (to undo: node backend/scripts/applyAuditToPractice.mjs rollback)`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
