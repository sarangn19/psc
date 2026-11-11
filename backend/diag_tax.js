const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  console.log('taxonomy', await p.taxonomyNode.count());
  const n = await p.taxonomyNode.findFirst();
  console.log(JSON.stringify(n));
  await p.$disconnect();
})();
