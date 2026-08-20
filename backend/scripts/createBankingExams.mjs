#!/usr/bin/env node
// Create IBPS & Banking exams with detailed taxonomies

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Banking exam taxonomy definition
const bankingTaxonomy = {
  'Quantitative Aptitude': [
    'Number System',
    'Simplification',
    'Percentage',
    'Ratio & Proportion',
    'Average',
    'Profit & Loss',
    'Simple & Compound Interest',
    'Time & Work',
    'Time & Distance',
    'Pipes & Cisterns',
    'Boats & Streams',
    'Permutation & Combination',
    'Probability',
    'Mensuration (2D)',
    'Mensuration (3D)',
    'Data Interpretation (Tables)',
    'Data Interpretation (Bar Graphs)',
    'Data Interpretation (Pie Charts)',
    'Data Interpretation (Line Graphs)',
    'Data Interpretation (Mixed)',
    'Quadratic Equations',
    'Number Series',
    'Approximation'
  ],
  'Reasoning Ability': [
    'Coding-Decoding',
    'Syllogism',
    'Inequality',
    'Blood Relations',
    'Direction Sense',
    'Ranking & Order',
    'Puzzles (Linear Arrangement)',
    'Puzzles (Circular Arrangement)',
    'Puzzles (Floor/Road)',
    'Puzzles (Box/Day/Month)',
    'Seating Arrangement (Linear)',
    'Seating Arrangement (Circular)',
    'Seating Arrangement (Rectangular)',
    'Machine Input-Output',
    'Data Sufficiency',
    'Logical Reasoning',
    'Assumption & Inference',
    'Cause & Effect',
    'Statement & Conclusion',
    'Course of Action',
    'Decision Making',
    'Assertion & Reason',
    'Alpha-Numeric-Symbol Series',
    'Analogy',
    'Classification',
    'Odd One Out',
    'Mirror & Water Image',
    'Paper Folding & Cutting',
    'Pattern Completion',
    'Venn Diagram'
  ],
  'English Language': [
    'Reading Comprehension',
    'Cloze Test',
    'Error Detection',
    'Sentence Improvement',
    'Sentence Rearrangement',
    'Fill in the Blanks (Single)',
    'Double Fillers',
    'Sentence Connectors',
    'Phrase Replacement',
    'Word Usage',
    'Synonyms',
    'Antonyms',
    'One Word Substitution',
    'Idioms & Phrases',
    'Match the Column',
    'Sentence Starters',
    'Word Association'
  ],
  'General Awareness': [
    'Banking Awareness (History)',
    'Banking Awareness (RBI Functions)',
    'Banking Awareness (Types of Banks)',
    'Banking Awareness (Financial Inclusion)',
    'Banking Awareness (Digital Banking)',
    'Banking Awareness (Banking Terms)',
    'Banking Awareness (Current Rates)',
    'Banking Awareness (Schemes)',
    'Current Affairs (National)',
    'Current Affairs (International)',
    'Current Affairs (Sports)',
    'Current Affairs (Awards)',
    'Current Affairs (Books & Authors)',
    'Current Affairs (Appointments)',
    'Current Affairs (Obituaries)',
    'Current Affairs (Summits)',
    'Static GK (Capitals & Currencies)',
    'Static GK (Important Days)',
    'Static GK (National Parks)',
    'Static GK (Awards & Honours)',
    'Static GK (Organizations)',
    'Static GK (Countries & Capitals)'
  ],
  'Computer Awareness': [
    'Computer Fundamentals',
    'Operating System',
    'MS Office',
    'Internet & Networking',
    'Database Management System',
    'Computer Security',
    'Computer Hardware',
    'Computer Software',
    'Number System & Codes',
    'Keyboard Shortcuts',
    'Computer Abbreviations',
    'History of Computer',
    'Input-Output Devices'
  ]
};

// Exams to create
const exams = [
  { name: 'IBPS PO', description: 'IBPS Probationary Officer / Management Trainee', category: 'Banking' },
  { name: 'IBPS Clerk', description: 'IBPS Clerical Cadre', category: 'Banking' },
  { name: 'SBI PO', description: 'SBI Probationary Officer', category: 'Banking' },
  { name: 'SBI Clerk', description: 'SBI Junior Associate (Clerk)', category: 'Banking' },
  { name: 'RBI Grade B', description: 'RBI Grade B Officer', category: 'Banking' },
  { name: 'IBPS RRB Officer Scale I', description: 'IBPS Regional Rural Bank Officer Scale I', category: 'Banking' },
  { name: 'IBPS RRB Office Assistant', description: 'IBPS Regional Rural Bank Office Assistant', category: 'Banking' }
];

async function main() {
  let created = 0;

  for (const examDef of exams) {
    // Check if exists
    const existing = await p.exam.findFirst({ where: { name: examDef.name } });
    if (existing) {
      console.log(`⚠️  ${examDef.name} already exists (id: ${existing.id})`);
      continue;
    }

    // Create exam
    const exam = await p.exam.create({ data: examDef });
    console.log(`\n📋 Created exam: ${exam.name} (id: ${exam.id})`);

    // Create subjects and chapters
    let subjectOrder = 0;
    for (const [subjectName, chapters] of Object.entries(bankingTaxonomy)) {
      const subject = await p.subject.create({
        data: {
          name: subjectName,
          examId: exam.id,
          order: subjectOrder++
        }
      });

      let chapterOrder = 0;
      for (const chapterName of chapters) {
        await p.chapter.create({
          data: {
            name: chapterName,
            subjectId: subject.id,
            order: chapterOrder++
          }
        });
      }
      console.log(`  ${subjectName}: ${chapters.length} chapters`);
    }

    created++;
  }

  console.log(`\n✅ Created ${created} new banking exams`);

  // Summary
  const allExams = await p.exam.findMany({
    include: { _count: { select: { subjects: true } } }
  });
  console.log(`\nTotal exams: ${allExams.length}`);
  for (const e of allExams) {
    console.log(`  ${e.name} (${e.category}): ${e._count.subjects} subjects`);
  }

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
