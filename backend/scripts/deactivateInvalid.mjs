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
  const ids = [...new Set(invalid.map(b => b.id))];
  
  console.log(`Deactivating ${ids.length} invalid questions...`);
  
  const result = await prisma.question.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false }
  });
  
  console.log(`✅ Deactivated ${result.count} questions`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});