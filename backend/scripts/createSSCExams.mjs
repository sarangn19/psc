import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

async function connect() {
  try {
    const p = new PrismaClient();
    await p.$queryRaw`SELECT 1`;
    console.log('(connected via DATABASE_URL pooler)');
    return p;
  } catch {
    const p = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    await p.$queryRaw`SELECT 1`;
    console.log('(connected via DIRECT_URL)');
    return p;
  }
}

const prisma = await connect();

const QUANT = [
  'Number System', 'Simplification', 'Percentage', 'Ratio & Proportion', 'Average',
  'Profit & Loss', 'Simple & Compound Interest', 'Time & Work', 'Time & Distance',
  'Pipes & Cisterns', 'Boats & Streams', 'Mixture & Alligation', 'Partnership',
  'Mensuration (2D)', 'Mensuration (3D)', 'Geometry', 'Trigonometry',
  'Height & Distance', 'Algebra', 'Data Interpretation (Tables)',
  'Data Interpretation (Bar Graphs)', 'Data Interpretation (Pie Charts)',
  'Data Interpretation (Line Graphs)', 'Data Interpretation (Mixed)',
];

const REASONING = [
  'Analogy', 'Classification', 'Number Series', 'Alphabet Series', 'Coding-Decoding',
  'Blood Relations', 'Direction Sense', 'Seating Arrangement (Linear)',
  'Seating Arrangement (Circular)', 'Syllogism', 'Venn Diagram',
  'Mirror & Water Image', 'Paper Folding & Cutting', 'Dice', 'Calendar',
  'Clock', 'Matrix', 'Word Formation', 'Embedded Figures', 'Counting Figures',
  'Ranking & Order', 'Alphabet Test', 'Mathematical Operations',
];

const ENGLISH = [
  'Reading Comprehension', 'Cloze Test', 'Error Spotting', 'Sentence Improvement',
  'Sentence Rearrangement', 'Fill in the Blanks', 'Active & Passive Voice',
  'Direct & Indirect Speech', 'One Word Substitution', 'Synonyms', 'Antonyms',
  'Idioms & Phrases', 'Spellings', 'Match the Column', 'Sentence Connectors',
];

const GA = [
  'History (Ancient)', 'History (Medieval)', 'History (Modern)', 'Geography (Indian)',
  'Geography (World)', 'Indian Polity', 'Indian Economy', 'Physics', 'Chemistry',
  'Biology', 'Static GK (Important Days)', 'Static GK (Awards & Honours)',
  'Static GK (Sports)', 'Static GK (Books & Authors)', 'Static GK (National Parks)',
  'Current Affairs (National)', 'Current Affairs (International)', 'Computer Awareness',
];

const SUBJECTS = [
  { name: 'Quantitative Aptitude', chapters: QUANT },
  { name: 'Reasoning', chapters: REASONING },
  { name: 'English Language', chapters: ENGLISH },
  { name: 'General Awareness', chapters: GA },
];

const EXAMS = [
  { name: 'SSC CGL', description: 'Staff Selection Commission Combined Graduate Level (Tier 1 + Tier 2)', category: 'SSC' },
  { name: 'SSC CHSL', description: 'Staff Selection Commission Combined Higher Secondary Level (10+2)', category: 'SSC' },
  { name: 'SSC MTS', description: 'Staff Selection Commission Multi Tasking Staff', category: 'SSC' },
  { name: 'SSC GD Constable', description: 'Staff Selection Commission General Duty Constable', category: 'SSC' },
];

for (const examDef of EXAMS) {
  let exam = await prisma.exam.findUnique({ where: { name: examDef.name } });
  if (exam) {
    console.log(`Exam "${examDef.name}" already exists (id: ${exam.id}), skipping creation...`);
  } else {
    exam = await prisma.exam.create({ data: { name: examDef.name, description: examDef.description, category: examDef.category } });
    console.log(`Created exam: ${exam.name} (id: ${exam.id})`);
  }

  for (const subDef of SUBJECTS) {
    let subject = await prisma.subject.findFirst({ where: { examId: exam.id, name: subDef.name } });
    if (!subject) {
      subject = await prisma.subject.create({ data: { name: subDef.name, examId: exam.id, order: SUBJECTS.indexOf(subDef) } });
      console.log(`  Created subject: ${subDef.name}`);
    }
    for (const chName of subDef.chapters) {
      const exists = await prisma.chapter.findFirst({ where: { subjectId: subject.id, name: chName } });
      if (!exists) {
        await prisma.chapter.create({ data: { name: chName, subjectId: subject.id, order: subDef.chapters.indexOf(chName) } });
      }
    }
    console.log(`  Subject "${subDef.name}": ${subDef.chapters.length} chapters ensured.`);
  }
  console.log(`Done with ${exam.name}`);
}

console.log('\n=== Final structure ===');
for (const e of EXAMS) {
  const exam = await prisma.exam.findUnique({ where: { name: e.name }, include: { subjects: { include: { chapters: true } } } });
  const chCount = exam.subjects.reduce((a, s) => a + s.chapters.length, 0);
  console.log(`${exam.name} [${exam.category}]: ${exam.subjects.length} subjects, ${chCount} chapters`);
}

await prisma.$disconnect();
