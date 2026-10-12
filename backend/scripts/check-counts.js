const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const exams = await prisma.exam.findMany({
    include: {
      subjects: {
        include: {
          chapters: {
            include: {
              _count: { select: { questions: true } }
            }
          }
        }
      }
    }
  });

  for (const exam of exams) {
    console.log('\n=== ' + exam.name + ' ===');
    let totalExam = 0;
    for (const sub of exam.subjects) {
      let totalSub = 0;
      const chapters = sub.chapters.map(c => ({ name: c.name, count: c._count.questions })).sort((a,b) => b.count - a.count);
      for (const c of chapters) totalSub += c.count;
      totalExam += totalSub;
      console.log('  ' + sub.name + ' (' + totalSub + ' questions)');
      for (const c of chapters.slice(0, 5)) {
        console.log('    ' + c.name + ': ' + c.count);
      }
      if (chapters.length > 5) console.log('    ... and ' + (chapters.length - 5) + ' more chapters');
    }
    console.log('  TOTAL: ' + totalExam);
  }
  await prisma.$disconnect();
})();
