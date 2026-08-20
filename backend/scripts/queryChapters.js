const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const chapters = await prisma.taxonomy.findMany({
    where: { level: 'CHAPTER', exam: { name: 'IBPS PO' } },
    orderBy: { name: 'asc' }
  });
  for (const c of chapters) {
    console.log(c.id, c.name);
  }
  await prisma.$disconnect();
})();
