import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const [questions, exams, chapters, users, subjects] = await Promise.all([
  p.question.count(),
  p.exam.count(),
  p.chapter.count(),
  p.user.count(),
  p.subject.count(),
]);
console.log(`Questions: ${questions}`);
console.log(`Exams: ${exams}`);
console.log(`Subjects: ${subjects}`);
console.log(`Chapters: ${chapters}`);
console.log(`Users: ${users}`);
await p.$disconnect();
