import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const dist = await p.$queryRawUnsafe(`
  SELECT 
    CASE 
      WHEN cnt = 0 THEN '0'
      WHEN cnt BETWEEN 1 AND 9 THEN '1-9'
      WHEN cnt BETWEEN 10 AND 49 THEN '10-49'
      WHEN cnt BETWEEN 50 AND 99 THEN '50-99'
      ELSE '100+'
    END as bucket,
    COUNT(*)::int as chapters
  FROM (SELECT c.id, COUNT(q.id) as cnt FROM chapters c LEFT JOIN questions q ON q."chapterId" = c.id GROUP BY c.id) sub
  GROUP BY 1 ORDER BY 1
`);
console.log('Question distribution across chapters:');
for (const r of dist) console.log(`  ${r.bucket} questions: ${r.chapters} chapters`);

const thin = await p.$queryRawUnsafe(`
  SELECT c.name as chapter, s.name as subject, COUNT(q.id)::int as qcount
  FROM chapters c
  JOIN subjects s ON c."subjectId" = s.id
  LEFT JOIN questions q ON q."chapterId" = c.id
  GROUP BY c.id, c.name, s.name
  HAVING COUNT(q.id) < 10
  ORDER BY qcount ASC
  LIMIT 15
`);
console.log('\nThinnest chapters (<10 questions):');
for (const r of thin) console.log(`  ${r.qcount} | ${r.chapter} (${r.subject})`);

process.exit();
