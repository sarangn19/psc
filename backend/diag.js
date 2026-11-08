const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const total = await p.question.count();
  const active = await p.question.count({ where: { isActive: true } });
  const withConcept = await p.question.count({ where: { isActive: true, conceptId: { not: null } } });
  console.log('total', total);
  console.log('active', active);
  console.log('active+concept', withConcept);
  const exams = await p.exam.findMany({ select: { id: true, name: true } });
  console.log('exams', exams.map(e => e.id + ':' + e.name).join(', '));
  // user exams for a sample user? just count
  const userExams = await p.userExam.count();
  console.log('userExam rows', userExams);
  // distinct examIds in questions via chapters/subjects
  const rows = await p.$queryRaw`SELECT s."examId", COUNT(*)::int AS c FROM questions q JOIN chapters ch ON q."chapterId"=ch.id JOIN subjects s ON ch."subjectId"=s.id GROUP BY s."examId"`;
  console.log('question counts by examId', rows);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
