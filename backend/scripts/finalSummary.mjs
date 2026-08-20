import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const total = await p.question.count();
const dist = await p.$queryRaw`
  SELECT n.level, COUNT(*) as count
  FROM questions q
  JOIN taxonomy_nodes n ON q."conceptId" = n.id
  GROUP BY n.level
  ORDER BY count DESC
`;

console.log('=== ConceptId Refinement Complete ===\n');
for (const d of dist) {
  const pct = ((Number(d.count) / total) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(Number(pct) / 2));
  console.log(`  ${d.level.padEnd(10)} ${String(d.count).padStart(6)} (${pct}%) ${bar}`);
}
console.log(`  ${''.padEnd(10)} ${String(total).padStart(6)} (100%)`);

// How many CONCEPT nodes are actually used
const usedConcepts = await p.$queryRaw`
  SELECT COUNT(DISTINCT q."conceptId") as count
  FROM questions q
  JOIN taxonomy_nodes n ON q."conceptId" = n.id
  WHERE n.level = 'CONCEPT'
`;
console.log(`\nUnique CONCEPT nodes used: ${usedConcepts[0].count} / 12204`);

await p.$disconnect();
