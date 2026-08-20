#!/usr/bin/env node
// Optimized: Refine conceptId using pre-built concept index

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

// Pre-build concept index: word → concept node ids
function buildConceptIndex(conceptNodes) {
  const index = new Map();
  for (const node of conceptNodes) {
    const words = tokenize(node.nameEnglish);
    for (const w of words) {
      if (!index.has(w)) index.set(w, []);
      index.get(w).push({ node, wordCount: words.length });
    }
  }
  return index;
}

function findBestConcept(questionText, conceptIndex) {
  const qTokens = tokenize(questionText);
  const scores = new Map(); // nodeId → score

  for (const t of qTokens) {
    const matches = conceptIndex.get(t);
    if (matches) {
      for (const m of matches) {
        const current = scores.get(m.node.id) || 0;
        // Score: word matches + bonus for shorter node names (more specific)
        scores.set(m.node.id, current + 1 + (m.wordCount <= 3 ? 2 : 0));
      }
    }
  }

  let bestNode = null;
  let bestScore = 0;
  for (const [nodeId, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestNode = nodeId;
    }
  }

  return bestScore >= 3 ? bestNode : null;
}

async function main() {
  const nodes = await p.taxonomyNode.findMany({
    select: { id: true, level: true, nameEnglish: true }
  });
  const nodeMap = new Map();
  for (const n of nodes) nodeMap.set(n.id, n);

  const conceptNodes = nodes.filter(n => n.level === 'CONCEPT');
  console.log(`Concept nodes: ${conceptNodes.length}`);

  const conceptIndex = buildConceptIndex(conceptNodes);
  console.log(`Index entries: ${conceptIndex.size}`);

  // Get questions needing refinement
  const allQuestions = await p.question.findMany({ select: { id: true, conceptId: true, text: true } });
  const needsRefinement = allQuestions.filter(q => {
    if (!q.conceptId) return false;
    const node = nodeMap.get(q.conceptId);
    return node && node.level !== 'CONCEPT';
  });
  console.log(`Questions to refine: ${needsRefinement.length}`);

  let refined = 0;
  let noMatch = 0;
  const updates = [];

  for (const q of needsRefinement) {
    const bestId = findBestConcept(q.text, conceptIndex);
    if (bestId) {
      updates.push({ id: q.id, conceptId: bestId });
      refined++;
    } else {
      noMatch++;
    }
  }

  console.log(`Matched: ${refined}, No match: ${noMatch}`);

  // Batch update
  const BATCH = 500;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(batch.map(u =>
      p.question.update({ where: { id: u.id }, data: { conceptId: u.conceptId } })
    ));
    if ((i + BATCH) % 5000 === 0) console.log(`  Updated: ${i + BATCH}/${updates.length}`);
  }

  console.log(`\n✅ Updated ${updates.length} questions`);

  // Final distribution
  const finalQ = await p.question.findMany({ select: { conceptId: true } });
  const dist = { EXAM: 0, SUBJECT: 0, DOMAIN: 0, TOPIC: 0, CONCEPT: 0 };
  for (const q of finalQ) {
    const node = nodeMap.get(q.conceptId);
    if (node) dist[node.level]++;
  }
  console.log('\n=== Final Distribution ===');
  for (const [l, c] of Object.entries(dist)) console.log(`  ${l}: ${c}`);

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
