#!/usr/bin/env node
// Final refined conceptId assignment with proper connection handling

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL + '&connection_limit=10&pool_timeout=60' } } });

function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

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
  const scores = new Map();
  for (const t of qTokens) {
    const matches = conceptIndex.get(t);
    if (matches) {
      for (const m of matches) {
        scores.set(m.node.id, (scores.get(m.node.id) || 0) + 1 + (m.wordCount <= 3 ? 2 : 0));
      }
    }
  }
  let bestId = null, bestScore = 0;
  for (const [id, score] of scores) {
    if (score > bestScore) { bestScore = score; bestId = id; }
  }
  return bestScore >= 3 ? bestId : null;
}

async function main() {
  const nodes = await p.taxonomyNode.findMany({ select: { id: true, level: true, nameEnglish: true } });
  const nodeMap = new Map(); for (const n of nodes) nodeMap.set(n.id, n);
  const conceptNodes = nodes.filter(n => n.level === 'CONCEPT');
  const conceptIndex = buildConceptIndex(conceptNodes);
  console.log(`Concepts: ${conceptNodes.length}, Index: ${conceptIndex.size}`);

  // Process in chunks of 5000 questions
  const CHUNK = 5000;
  let totalRefined = 0;
  let totalNoMatch = 0;
  let offset = 0;

  while (true) {
    const questions = await p.question.findMany({
      select: { id: true, conceptId: true, text: true },
      skip: offset,
      take: CHUNK,
      where: { conceptId: { not: null } }
    });

    if (questions.length === 0) break;

    const needsRefinement = questions.filter(q => {
      const node = nodeMap.get(q.conceptId);
      return node && node.level !== 'CONCEPT';
    });

    const updates = [];
    for (const q of needsRefinement) {
      const bestId = findBestConcept(q.text, conceptIndex);
      if (bestId) updates.push({ id: q.id, conceptId: bestId });
    }

    totalRefined += updates.length;
    totalNoMatch += needsRefinement.length - updates.length;

    // Sequential updates to avoid pool exhaustion
    for (const u of updates) {
      await p.question.update({ where: { id: u.id }, data: { conceptId: u.conceptId } });
    }

    offset += CHUNK;
    console.log(`  Processed ${offset} questions, refined ${totalRefined} so far`);

    if (questions.length < CHUNK) break;
  }

  console.log(`\n✅ Total refined: ${totalRefined}`);
  console.log(`   No match: ${totalNoMatch}`);

  // Final distribution
  const allQ = await p.question.findMany({ select: { conceptId: true } });
  const dist = { EXAM: 0, SUBJECT: 0, DOMAIN: 0, TOPIC: 0, CONCEPT: 0 };
  for (const q of allQ) {
    const node = nodeMap.get(q.conceptId);
    if (node) dist[node.level]++;
  }
  console.log('\n=== Final Distribution ===');
  for (const [l, c] of Object.entries(dist)) console.log(`  ${l}: ${c}`);

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
