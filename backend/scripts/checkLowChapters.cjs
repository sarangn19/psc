const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const chapters = await prisma.chapter.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { questions: { _count: 'asc' } },
    take: 30
  });
  
  console.log('Bottom 30 chapters (fewest questions):');
  for (const c of chapters) {
    const count = String(c._count.questions).padStart(5);
    console.log(`${count} | ${c.name}`);
  }
  
  await prisma.$disconnect();
}

main();
