import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Check sample: questions without concept, their chapters, and available taxonomy
const sample = await p.question.findMany({
  where: { conceptId: null },
  take: 5,
  include: { chapter: { include: { subject: { include: { exam: true } } } } },
});

console.log('Sample questions without concept:');
for (const q of sample) {
  console.log(`\nQ: ${q.text.slice(0, 80)}...`);
  console.log(`  Chapter: ${q.chapter.name} (${q.chapter.id})`);
  console.log(`  Subject: ${q.chapter.subject.name}`);
  console.log(`  Exam: ${q.chapter.subject.exam.name}`);

  // Find taxonomy nodes for this subject
  const nodes = await p.taxonomyNode.findMany({
    where: { nameEnglish: { contains: q.chapter.subject.name.split(' ')[0] } },
    take: 3,
    select: { id: true, level: true, nameEnglish: true },
  });
  console.log(`  Matching taxonomy nodes: ${JSON.stringify(nodes)}`);
}

// Count by subject for questions without concept
const bySubject = await p.$queryRawUnsafe(`
  SELECT s.name as subject, COUNT(*)::int as count
  FROM questions q
  JOIN chapters c ON q."chapterId" = c.id
  JOIN subjects s ON c."subjectId" = s.id
  WHERE q."conceptId" IS NULL
  GROUP BY s.name
  ORDER BY count DESC
  LIMIT 20
`);
console.log('\nTop subjects with unmapped questions:');
for (const row of bySubject) {
  console.log(`  ${row.subject}: ${row.count}`);
}

process.exit();
