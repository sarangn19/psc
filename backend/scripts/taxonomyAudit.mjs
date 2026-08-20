import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Count nodes per level
const levels = await p.taxonomyNode.groupBy({ by: ['level'], _count: true });
console.log('=== Taxonomy Levels ===');
for (const l of levels) {
  console.log(`  ${l.level}: ${l._count._all} nodes`);
}
console.log(`  TOTAL: ${levels.reduce((a, l) => a + l._count._all, 0)} nodes`);

// Show hierarchy examples
console.log('\n=== Example Hierarchy ===');

// Get a few EXAM level nodes
const exams = await p.taxonomyNode.findMany({ where: { level: 'EXAM' }, take: 3 });
for (const exam of exams) {
  console.log(`\n${exam.id}: ${exam.nameEnglish} [EXAM]`);
  
  const subjects = await p.taxonomyNode.findMany({ where: { parentId: exam.id, level: 'SUBJECT' } });
  for (const sub of subjects.slice(0, 2)) {
    console.log(`  ${sub.id}: ${sub.nameEnglish} [SUBJECT]`);
    
    const domains = await p.taxonomyNode.findMany({ where: { parentId: sub.id, level: 'DOMAIN' } });
    for (const dom of domains.slice(0, 2)) {
      console.log(`    ${dom.id}: ${dom.nameEnglish} [DOMAIN]`);
      
      const topics = await p.taxonomyNode.findMany({ where: { parentId: dom.id, level: 'TOPIC' } });
      for (const topic of topics.slice(0, 2)) {
        console.log(`      ${topic.id}: ${topic.nameEnglish} [TOPIC]`);
        
        const concepts = await p.taxonomyNode.findMany({ where: { parentId: topic.id, level: 'CONCEPT' } });
        for (const concept of concepts.slice(0, 2)) {
          console.log(`        ${concept.id}: ${concept.nameEnglish} [CONCEPT]`);
        }
      }
    }
  }
}

// Check how many questions have conceptId at each level
console.log('\n=== Questions linked to Taxonomy Nodes ===');
const conceptIds = await p.taxonomyNode.findMany({ select: { id: true, level: true } });
const levelMap = new Map();
for (const c of conceptIds) levelMap.set(c.id, c.level);

const questions = await p.question.findMany({ select: { conceptId: true } });
let levelCounts = { EXAM: 0, SUBJECT: 0, DOMAIN: 0, TOPIC: 0, CONCEPT: 0, null: 0 };
for (const q of questions) {
  if (q.conceptId === null) { levelCounts.null++; continue; }
  const level = levelMap.get(q.conceptId);
  if (level) levelCounts[level]++;
  else levelCounts.null++;
}
console.log('Questions linked to node level:');
for (const [level, count] of Object.entries(levelCounts)) {
  console.log(`  ${level}: ${count}`);
}

await p.$disconnect();
