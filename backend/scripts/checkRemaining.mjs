import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Check remaining unmapped by subject
const remaining = await p.$queryRawUnsafe(`
  SELECT s.name as subject, COUNT(*)::int as count
  FROM questions q
  JOIN chapters c ON q."chapterId" = c.id
  JOIN subjects s ON c."subjectId" = s.id
  WHERE q."conceptId" IS NULL
  GROUP BY s.name
  ORDER BY count DESC
`);
console.log('Remaining unmapped by subject:');
for (const row of remaining) {
  // Check what DOMAIN nodes exist for this subject
  const domains = await p.$queryRawUnsafe(`
    SELECT t.id, t."nameEnglish"
    FROM taxonomy_nodes t
    JOIN taxonomy_nodes parent ON t."parentId" = parent.id
    WHERE t.level = 'DOMAIN' AND parent.level = 'SUBJECT'
      AND (parent."nameEnglish" ILIKE '%' || $1 || '%'
        OR parent."nameEnglish" = $1)
    LIMIT 5
  `, row.subject);
  console.log(`  ${row.subject}: ${row.count} (domains: ${domains.map(d => d.nameEnglish).join(', ') || 'NONE'})`);
}

process.exit();
