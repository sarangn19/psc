import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const total = await prisma.question.count();
const uniq = await prisma.question.findMany({ distinct: ['text'], select: { text: true } });
console.log(`Total: ${total}, Unique texts: ${uniq.length}`);
await prisma.$disconnect();