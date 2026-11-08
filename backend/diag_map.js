const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const c = await p.chapter.findFirst();
  console.log('CHAPTER', JSON.stringify(c));
  const t = await p.taxonomyNode.findFirst({ where: { id: 614 } });
  console.log('NODE 614', JSON.stringify(t));
  await p.$disconnect();
})();
