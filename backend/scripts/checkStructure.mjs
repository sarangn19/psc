import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Check current exam structure
const exams = await p.exam.findMany({
  include: {
    subjects: {
      include: {
        chapters: { select: { id: true, name: true } }
      }
    }
  }
});

for (const exam of exams) {
  const subs = exam.subjects.map(s => s.name);
  const uniqueSubs = [...new Set(subs)];
  const chapterCount = exam.subjects.reduce((acc, s) => acc + s.chapters.length, 0);
  console.log(`${exam.name}: ${uniqueSubs.length} subjects, ${chapterCount} chapters`);
  for (const sub of exam.subjects) {
    console.log(`  ${sub.name}: ${sub.chapters.map(c => c.name).join(', ')}`);
  }
  console.log();
}

// Check LDC structure as template
const ldc = exams.find(e => e.name.includes('LDC'));
const ldcSubjects = ldc.subjects.reduce((acc, s) => {
  if (!acc.find(x => x.name === s.name)) acc.push(s);
  return acc;
}, []);

console.log('LDC unique subjects:');
for (const s of ldcSubjects) {
  const chs = ldc.subjects.find(x => x.name === s.name).chapters;
  console.log(`  ${s.name} (id: ${s.id}): ${chs.map(c => c.name).join(', ')}`);
}

await p.$disconnect();
