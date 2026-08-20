import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Check remaining TOPIC level questions
const topicQ = await p.$queryRaw`
  SELECT q.id, q.text, n.id as node_id, n."nameEnglish" as node_name, n."parentId"
  FROM questions q
  JOIN taxonomy_nodes n ON q."conceptId" = n.id
  WHERE n.level = 'TOPIC'
  LIMIT 20
`;
console.log('=== Sample TOPIC-level questions ===');
for (const q of topicQ) {
  console.log(`  "${q.text.slice(0, 50)}..." → ${q.node_name} (id: ${q.node_id})`);
}

// Check if TOPIC nodes have CONCEPT children
const topicIds = [...new Set(topicQ.map(q => q.node_id))];
const topicChildren = await p.$queryRaw`
  SELECT parent_id, COUNT(*) as child_count
  FROM taxonomy_nodes
  WHERE "parentId" IN (${topicIds.join(',')}) AND level = 'CONCEPT'
  GROUP BY parent_id
`;
console.log('\n=== TOPIC nodes with CONCEPT children ===');
for (const t of topicChildren) {
  const node = await p.taxonomyNode.findUnique({ where: { id: t.parent_id }, select: { nameEnglish: true } });
  console.log(`  ${node?.nameEnglish}: ${t.child_count} concepts`);
}

// Final summary
const total = await p.question.count();
const dist = await p.$queryRaw`
  SELECT n.level, COUNT(*) as count
  FROM questions q
  JOIN taxonomy_nodes n ON q."conceptId" = n.id
  GROUP BY n.level
  ORDER BY count DESC
`;
console.log('\n=== Final Taxonomy Distribution ===');
for (const d of dist) {
  const pct = ((d.count / total) * 100).toFixed(1);
  console.log(`  ${d.level}: ${d.count} (${pct}%)`);
}

await p.$disconnect();
