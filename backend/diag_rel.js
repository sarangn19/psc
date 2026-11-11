const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const qs = await p.question.findMany({ where: { conceptId: { not: null } }, take: 5, include: { chapter: { include: { subject: { include: { exam: true } } } } } });
  console.log(JSON.stringify(qs.map(q => ({ id: q.id, conceptId: q.conceptId, chapter: q.chapter.name, subject: q.chapter.subject.name, exam: q.chapter.subject.exam.name })), null, 2));
  const withConcept = await p.question.count({ where: { conceptId: { not: null } } });
  console.log('questions with concept', withConcept);
  await p.$disconnect();
})();
