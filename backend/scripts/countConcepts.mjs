import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const nodes = await prisma.taxonomyNode.findMany({ where: { level: 'CONCEPT' }, include: { _count: { select: { questions: true } } } });
const withQ = nodes.filter(n => n._count.questions > 0);
console.log(`Concepts with questions: ${withQ.length} / ${nodes.length}`);
console.log(`Concepts with 0 questions: ${nodes.length - withQ.length}`);
await prisma.$disconnect();
