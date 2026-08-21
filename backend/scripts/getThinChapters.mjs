import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
const p = new PrismaClient();

const thin = await p.$queryRawUnsafe(`
  SELECT c.id as "chapterId", c.name as "chapterName", s.name as "subjectName",
    COUNT(q.id)::int as "currentCount"
  FROM chapters c
  JOIN subjects s ON c."subjectId" = s.id
  LEFT JOIN questions q ON q."chapterId" = c.id
  GROUP BY c.id, c.name, s.name
  HAVING COUNT(q.id) < 10
  ORDER BY "currentCount" ASC
`);

const TARGET = 15;
const batches = thin.map(ch => ({
  chapterId: ch.chapterId,
  chapterName: ch.chapterName,
  subjectName: ch.subjectName,
  currentCount: ch.currentCount,
  needed: TARGET - ch.currentCount,
}));

console.log(`Thin chapters: ${batches.length}`);
console.log(`Total to generate: ${batches.reduce((a, b) => a + b.needed, 0)}`);

writeFileSync('scripts/thinChapters.json', JSON.stringify(batches));
console.log('Written to thinChapters.json');
process.exit();
