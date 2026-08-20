#!/usr/bin/env node
// Refine conceptId: push questions down to CONCEPT level where possible

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function findBestConceptNode(questionText, nodes, nodeMap) {
  const qTokens = new Set(tokenize(questionText));
  
  // Get all CONCEPT level nodes
  const conceptNodes = nodes.filter(n => n.level === 'CONCEPT');
  
  let bestNode = null;
  let bestScore = 0;
  
  for (const node of conceptNodes) {
    const nodeTokens = new Set(tokenize(node.nameEnglish));
    let score = 0;
    for (const t of qTokens) {
      if (nodeTokens.has(t)) score++;
    }
    // Bonus for longer token matches
    for (const t of qTokens) {
      if (nodeTokens.has(t) && t.length > 5) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }
  
  // Only use if score is meaningful (at least 2 tokens match)
  return bestScore >= 2 ? bestNode : null;
}

async function main() {
  const nodes = await p.taxonomyNode.findMany({
    select: { id: true, level: true, nameEnglish: true, parentId: true }
  });
  const nodeMap = new Map();
  for (const n of nodes) nodeMap.set(n.id, n);

  console.log(`Loaded ${nodes.length} taxonomy nodes`);

  // Get questions that need refinement (not at CONCEPT level)
  const toRefine = await p.question.findMany({
    where: {
      conceptId: { not: null },
      // Exclude CONCEPT level - we'll check in code
    },
    select: { id: true, conceptId: true, text: true }
  });

  // Filter to only those not at CONCEPT level
  const needsRefinement = toRefine.filter(q => {
    const node = nodeMap.get(q.conceptId);
    return node && node.level !== 'CONCEPT';
  });

  console.log(`Questions needing refinement: ${needsRefinement.length}`);
  console.log(`  EXAM: ${needsRefinement.filter(q => nodeMap.get(q.conceptId)?.level === 'EXAM').length}`);
  console.log(`  SUBJECT: ${needsRefinement.filter(q => nodeMap.get(q.conceptId)?.level === 'SUBJECT').length}`);
  console.log(`  DOMAIN: ${needsRefinement.filter(q => nodeMap.get(q.conceptId)?.level === 'DOMAIN').length}`);
  console.log(`  TOPIC: ${needsRefinement.filter(q => nodeMap.get(q.conceptId)?.level === 'TOPIC').length}`);

  let refined = 0;
  let noMatch = 0;
  const BATCH = 200;

  for (let i = 0; i < needsRefinement.length; i += BATCH) {
    const batch = needsRefinement.slice(i, i + BATCH);
    const updates = [];

    for (const q of batch) {
      const bestConcept = findBestConceptNode(q.text, nodes, nodeMap);
      if (bestConcept) {
        updates.push({ id: q.id, conceptId: bestConcept.id });
      } else {
        noMatch++;
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates.map(u =>
        p.question.update({ where: { id: u.id }, data: { conceptId: u.conceptId } })
      ));
      refined += updates.length;
    }

    if ((i + BATCH) % 2000 === 0 || i + BATCH >= needsRefinement.length) {
      console.log(`  Progress: ${Math.min(i + BATCH, needsRefinement.length)}/${needsRefinement.length}`);
    }
  }

  console.log(`\n✅ Refined: ${refined} questions`);
  console.log(`   No match found: ${noMatch} questions`);

  // Verify final distribution
  const finalQuestions = await p.question.findMany({ select: { conceptId: true } });
  const finalLevels = { EXAM: 0, SUBJECT: 0, DOMAIN: 0, TOPIC: 0, CONCEPT: 0, null: 0 };
  for (const q of finalQuestions) {
    if (q.conceptId === null) { finalLevels.null++; continue; }
    const node = nodeMap.get(q.conceptId);
    if (node) finalLevels[node.level]++;
    else finalLevels.null++;
  }

  console.log('\n=== Final Distribution ===');
  for (const [level, count] of Object.entries(finalLevels)) {
    console.log(`  ${level}: ${count}`);
  }

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
