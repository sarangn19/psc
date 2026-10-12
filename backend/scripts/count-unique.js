const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const total = await prisma.question.count({ where: { isActive: true } });
  const unique = await prisma.question.groupBy({ by: ['text'], _count: true });
  console.log('Total rows:', total);
  console.log('Unique question texts:', unique.length);
  await prisma.$disconnect();
})();
