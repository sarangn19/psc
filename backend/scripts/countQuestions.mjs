import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const total = await p.question.count();
console.log('Total questions in DB:', total);

const uniqueText = await p.$queryRaw`SELECT COUNT(DISTINCT text) as unique_count FROM questions`;
console.log('Unique question texts:', uniqueText[0].unique_count);

const byExam = await p.$queryRaw`
  SELECT e.name as exam, COUNT(*)::int as count
  FROM questions q
  JOIN chapters c ON c.id = q."chapterId"
  JOIN subjects s ON s.id = c."subjectId"
  JOIN exams e ON e.id = s."examId"
  GROUP BY e.name
  ORDER BY e.name
`;
console.log('\nQuestions per exam:');
for (const r of byExam) {
  console.log(`  ${r.exam}: ${r.count}`);
}

const byChapter = await p.$queryRaw`
  SELECT c.name as chapter, COUNT(*)::int as count
  FROM questions q
  JOIN chapters c ON c.id = q."chapterId"
  GROUP BY c.name
  ORDER BY count DESC
  LIMIT 20
`;
console.log('\nTop 20 chapters by question count:');
for (const r of byChapter) {
  console.log(`  ${r.chapter}: ${r.count}`);
}

await p.$disconnect();
