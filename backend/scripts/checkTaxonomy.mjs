import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Find the Newton's Third Law concept and its parents
const node = await prisma.taxonomyNode.findFirst({
  where: { nameEnglish: 'Newton\'s Third Law' },
  include: { parent: { include: { parent: { include: { parent: true } } } } }
});

if (node) {
  console.log('Concept:', node.nameEnglish, '(level:', node.level, ')');
  let p = node.parent;
  let depth = 1;
  while (p) {
    console.log(`  ${'  '.repeat(depth)}Parent: ${p.nameEnglish} (level: ${p.level})`);
    p = p.parent;
    depth++;
  }
} else {
  console.log('Not found');
}

// Find where questions with conceptId exist
const linkedConcepts = await prisma.taxonomyNode.findMany({
  where: { level: 'CONCEPT', questions: { some: {} } },
  include: { _count: { select: { questions: true } } },
  orderBy: { id: 'asc' },
  take: 10
});
console.log('\nSample linked concepts:');
linkedConcepts.forEach(c => console.log(`  ${c.nameEnglish} (${c._count.questions} questions)`));

await prisma.$disconnect();
