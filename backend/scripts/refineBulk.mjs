#!/usr/bin/env node
// Bulk refine conceptIds using SQL — much faster

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL + '&connection_limit=10&pool_timeout=60' } } });

function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

async function main() {
  // Load all concept nodes
  const nodes = await p.taxonomyNode.findMany({ select: { id: true, level: true, nameEnglish: true } });
  const conceptNodes = nodes.filter(n => n.level === 'CONCEPT');
  console.log(`Concept nodes: ${conceptNodes.length}`);

  // Build word → concept mapping
  const wordToConcepts = new Map();
  for (const node of conceptNodes) {
    const words = tokenize(node.nameEnglish);
    for (const w of words) {
      if (w.length < 3) continue;
      if (!wordToConcepts.has(w)) wordToConcepts.set(w, []);
      wordToConcepts.get(w).push({ id: node.id, wordCount: words.length });
    }
  }
  console.log(`Word index: ${wordToConcepts.size} entries`);

  // Load questions that need refinement
  const questions = await p.question.findMany({
    select: { id: true, conceptId: true, text: true },
    where: { conceptId: { not: null } }
  });

  const needsRefinement = questions.filter(q => {
    const node = nodes.find(n => n.id === q.conceptId);
    return node && node.level !== 'CONCEPT';
  });
  console.log(`Questions to refine: ${needsRefinement.length}`);

  // Find best concept for each
  const updates = [];
  for (const q of needsRefinement) {
    const qTokens = tokenize(q.text);
    const scores = new Map();
    for (const t of qTokens) {
      const matches = wordToConcepts.get(t);
      if (matches) {
        for (const m of matches) {
          scores.set(m.id, (scores.get(m.id) || 0) + 1 + (m.wordCount <= 3 ? 2 : 0));
        }
      }
    }
    let bestId = null, bestScore = 0;
    for (const [id, score] of scores) {
      if (score > bestScore) { bestScore = score; bestId = id; }
    }
    if (bestScore >= 3 && bestId) {
      updates.push({ id: q.id, conceptId: bestId });
    }
  }

  console.log(`Updates to apply: ${updates.length}`);

  // Apply in bulk using SQL
  const BATCH = 200;
  let applied = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    // Build CASE statement
    const cases = batch.map(u => `('${u.id}', ${u.conceptId})`).join(',');
    await p.$executeRawUnsafe(`
      UPDATE questions 
      SET "conceptId" = v.new_concept
      FROM (VALUES ${cases}) AS v(id, new_concept)
      WHERE questions.id = v.id
    `);
    applied += batch.length;
    if (applied % 5000 === 0 || applied >= updates.length) {
      console.log(`  Applied: ${applied}/${updates.length}`);
    }
  }

  console.log(`\n✅ Updated ${applied} questions`);

  // Final distribution
  const dist = await p.$queryRaw`
    SELECT 
      CASE 
        WHEN n.level = 'EXAM' THEN 'EXAM'
        WHEN n.level = 'SUBJECT' THEN 'SUBJECT'
        WHEN n.level = 'DOMAIN' THEN 'DOMAIN'
        WHEN n.level = 'TOPIC' THEN 'TOPIC'
        WHEN n.level = 'CONCEPT' THEN 'CONCEPT'
      END as level,
      COUNT(*) as count
    FROM questions q
    JOIN taxonomy_nodes n ON q."conceptId" = n.id
    GROUP BY n.level
    ORDER BY count DESC
  `;
  console.log('\n=== Final Distribution ===');
  for (const d of dist) console.log(`  ${d.level}: ${d.count}`);

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
