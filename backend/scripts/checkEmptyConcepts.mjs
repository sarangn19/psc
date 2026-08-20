import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const nodes = await prisma.taxonomyNode.findMany({
  where: { level: 'CONCEPT' },
  include: { _count: { select: { questions: true } } }
});

const empty = nodes.filter(n => n._count.questions === 0);
const low = nodes.filter(n => n._count.questions > 0 && n._count.questions <= 5);

console.log(`Total CONCEPT nodes: ${nodes.length}`);
console.log(`With 0 questions: ${empty.length}`);
console.log(`With 1-5 questions: ${low.length}`);
console.log('');

if (empty.length > 0) {
  console.log('=== EMPTY CONCEPTS (0 questions) ===');
  empty.forEach(n => console.log(`  - ${n.nameEnglish || n.name}`));
}

if (low.length > 0) {
  console.log('\n=== LOW CONCEPTS (1-5 questions) ===');
  low.forEach(n => console.log(`  - ${n.nameEnglish || n.name} (${n._count.questions})`));
}

await prisma.$disconnect();
