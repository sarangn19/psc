import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// 1. Current distribution
const nodes = await p.taxonomyNode.findMany({ select: { id: true, level: true, nameEnglish: true, parentId: true } });
const nodeMap = new Map();
for (const n of nodes) nodeMap.set(n.id, n);

const questions = await p.question.findMany({ select: { id: true, conceptId: true, text: true, chapterId: true } });
const byLevel = { EXAM: [], SUBJECT: [], DOMAIN: [], TOPIC: [], CONCEPT: [] };
for (const q of questions) {
  if (q.conceptId === null) continue;
  const node = nodeMap.get(q.conceptId);
  if (node) byLevel[node.level].push(q);
}

console.log('=== Current Distribution ===');
for (const [level, qs] of Object.entries(byLevel)) {
  console.log(`  ${level}: ${qs.length} questions`);
}

// 2. For EXAM and SUBJECT level questions, try to find better CONCEPT nodes
console.log('\n=== Refinement Plan ===');

// Get all CONCEPT level nodes
const conceptNodes = nodes.filter(n => n.level === 'CONCEPT');
console.log(`Total CONCEPT nodes: ${conceptNodes.length}`);

// Get all TOPIC level nodes
const topicNodes = nodes.filter(n => n.level === 'TOPIC');
console.log(`Total TOPIC nodes: ${topicNodes.length}`);

// Get all DOMAIN level nodes
const domainNodes = nodes.filter(n => n.level === 'DOMAIN');
console.log(`Total DOMAIN nodes: ${domainNodes.length}`);

// Build parent chain for concept nodes
function getAncestors(nodeId) {
  const chain = [];
  let current = nodeMap.get(nodeId);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? nodeMap.get(current.parentId) : null;
  }
  return chain;
}

// For each concept node, get its full path
const conceptPaths = new Map();
for (const cn of conceptNodes) {
  const chain = getAncestors(cn.id);
  conceptPaths.set(cn.id, chain.map(n => n.nameEnglish).join(' > '));
}

// 3. Show sample questions at each level with their chapter context
console.log('\n=== Sample Questions by Level ===');
for (const [level, qs] of Object.entries(byLevel)) {
  if (qs.length === 0) continue;
  console.log(`\n${level} level (${qs.length} questions):`);
  for (const q of qs.slice(0, 3)) {
    const node = nodeMap.get(q.conceptId);
    console.log(`  Q: "${q.text.slice(0, 60)}..."`);
    console.log(`  Node: ${node.nameEnglish} (id: ${node.id})`);
    if (node.level !== 'CONCEPT') {
      // Find children
      const children = nodes.filter(n => n.parentId === node.id);
      console.log(`  Children: ${children.map(c => c.nameEnglish).join(', ') || 'none'}`);
    }
  }
}

await p.$disconnect();
