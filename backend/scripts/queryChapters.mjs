import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const chapters = await p.chapter.findMany({
  where: { subject: { exam: { name: { contains: 'IBPS PO' } } } },
  select: { id: true, name: true },
  orderBy: { name: 'asc' }
});
for (const c of chapters) {
  console.log(c.id, c.name);
}
await p.$disconnect();
