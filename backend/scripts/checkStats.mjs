import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const [total, nullConcept, chapters] = await Promise.all([
  p.question.count(),
  p.question.count({ where: { conceptId: null } }),
  p.chapter.count(),
]);
const [row] = await p.$queryRawUnsafe('SELECT COUNT(DISTINCT text) as unique_count FROM questions');

console.log('Total questions:', total);
console.log('Unique texts:', row.unique_count);
console.log('Without concept:', nullConcept);
console.log('Chapters:', chapters);
process.exit();
