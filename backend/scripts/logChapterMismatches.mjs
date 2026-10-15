import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  const lines = fs.readFileSync(path.resolve(__dirname, 'audit_bad.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean);
  
  const invalid = lines.map(l => JSON.parse(l)).filter(b => !b.valid);
  const mismatch = invalid.filter(b => b.reason && b.reason.toLowerCase().includes('mismatch'));
  
  console.log(`Found ${mismatch.length} chapter mismatch questions (already deactivated)`);
  
  // Log for manual review
  const report = mismatch.map(b => ({
    id: b.id,
    currentChapter: b.chapter,
    text: b.text.slice(0, 100),
    reason: b.reason
  }));
  
  fs.writeFileSync(
    path.resolve(__dirname, 'chapter_mismatches.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log('✅ Chapter mismatches saved to scripts/chapter_mismatches.json');
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});