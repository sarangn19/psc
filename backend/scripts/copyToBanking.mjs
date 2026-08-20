#!/usr/bin/env node
// Copy relevant LDC questions to banking exams where subjects overlap

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Map: LDC chapter name → Banking subject/chapter name
const OVERLAP = {
  // Math → Quantitative Aptitude
  'Number System': 'Number System',
  'Percentages': 'Percentage',
  'Profit & Loss': 'Profit & Loss',
  'Time & Work': 'Time & Work',
  'Time & Distance': 'Time & Distance',
  'Simple & Compound Interest': 'Simple & Compound Interest',
  'Mensuration': 'Mensuration (2D)',
  'Algebra': 'Quadratic Equations',

  // English → English Language
  'Grammar Basics': 'Error Detection',
  'Tenses': 'Error Detection',
  'Articles & Prepositions': 'Fill in the Blanks (Single)',
  'Comprehension': 'Reading Comprehension',
  'Vocabulary': 'Synonyms',
  'Synonyms & Antonyms': 'Antonyms',

  // Current Affairs → General Awareness
  'Monthly Current Affairs': 'Current Affairs (National)',
  'National News': 'Current Affairs (National)',
  'International News': 'Current Affairs (International)',
  'Sports & Awards': 'Current Affairs (Sports)',
  'Government Schemes': 'Current Affairs (Summits)',
  'Important Appointments': 'Current Affairs (Appointments)',

  // GK → General Awareness (Static)
  'Kerala History': 'Static GK (Important Days)',
  'Indian History': 'Static GK (Awards & Honours)',
  'Indian Constitution': 'Static GK (Organizations)',
  'Geography of Kerala': 'Static GK (National Parks)',
  'Indian Geography': 'Static GK (Countries & Capitals)',
  'Economy': 'Banking Awareness (Banking Terms)',
  'Science & Technology': 'Computer Fundamentals',

  // Science → Computer Awareness
  'Computer Basics': 'Computer Fundamentals',
  'Physics Basics': 'Computer Hardware',
  'Chemistry Basics': 'Computer Software',
  'Biology Basics': 'Input-Output Devices',
  'Environment & Ecology': 'Internet & Networking',
  'Human Body': 'Computer Security',
};

async function main() {
  // Get banking exams
  const bankingExams = await p.exam.findMany({ where: { category: 'Banking' } });
  console.log(`Banking exams: ${bankingExams.map(e => e.name).join(', ')}`);

  // Get LDC exam and chapters
  const ldc = await p.exam.findFirst({ where: { name: { contains: 'LDC' } } });
  const ldcChapters = await p.chapter.findMany({
    where: { subject: { examId: ldc.id } },
    include: { _count: { select: { questions: true } } }
  });

  let totalCopied = 0;

  for (const exam of bankingExams) {
    console.log(`\n📋 Processing ${exam.name}...`);

    // Get this exam's chapters
    const examChapters = await p.chapter.findMany({
      where: { subject: { examId: exam.id } }
    });
    const examChapterMap = new Map();
    for (const ch of examChapters) examChapterMap.set(ch.name, ch);

    let examCopied = 0;

    for (const ldcCh of ldcChapters) {
      if (ldcCh._count.questions === 0) continue;

      const targetChapterName = OVERLAP[ldcCh.name];
      if (!targetChapterName) continue;

      const targetCh = examChapterMap.get(targetChapterName);
      if (!targetCh) {
        console.log(`  ⚠️  Chapter "${targetChapterName}" not found in ${exam.name}`);
        continue;
      }

      // Fetch LDC questions
      const questions = await p.question.findMany({
        where: { chapterId: ldcCh.id },
        select: {
          conceptId: true, text: true, options: true, correctOption: true,
          explanation: true, difficulty: true, tags: true, isActive: true
        }
      });

      // Batch insert
      const BATCH = 500;
      for (let i = 0; i < questions.length; i += BATCH) {
        const batch = questions.slice(i, i + BATCH).map(q => ({
          chapterId: targetCh.id,
          conceptId: q.conceptId,
          text: q.text,
          options: q.options,
          correctOption: q.correctOption,
          explanation: q.explanation,
          difficulty: q.difficulty,
          tags: [...(q.tags || []), 'source:psc'],
          isActive: q.isActive
        }));
        await p.question.createMany({ data: batch });
        examCopied += batch.length;
      }
    }

    console.log(`  ✅ Copied ${examCopied} questions to ${exam.name}`);
    totalCopied += examCopied;
  }

  console.log(`\n🎉 Total copied: ${totalCopied} questions`);

  // Verify
  for (const exam of bankingExams) {
    const count = await p.question.count({
      where: { chapter: { subject: { examId: exam.id } } }
    });
    console.log(`  ${exam.name}: ${count} questions`);
  }

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
