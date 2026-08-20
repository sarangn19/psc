#!/usr/bin/env node
// Fix: Move questions from wrong-exam chapters to correct LDC chapters

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function main() {
  // LDC exam ID
  const ldc = await p.exam.findFirst({ where: { name: { contains: 'LDC' } } });
  console.log('LDC exam:', ldc.name, ldc.id);

  // Get LDC chapters
  const ldcChapters = await p.chapter.findMany({
    where: { subject: { examId: ldc.id } },
    select: { id: true, name: true }
  });
  const ldcChapterMap = new Map();
  for (const c of ldcChapters) ldcChapterMap.set(c.name, c);

  // Chapters to fix: the ones in wrong exams that have questions
  const wrongChapters = await p.chapter.findMany({
    where: { subject: { examId: { not: ldc.id } } },
    include: {
      questions: { select: { id: true, text: true } },
      subject: { select: { name: true, exam: { select: { name: true } } } }
    }
  });

  const chaptersWithQ = wrongChapters.filter(c => c.questions.length > 0);
  console.log(`\nFound ${chaptersWithQ.length} non-LDC chapters with questions`);

  let totalMoved = 0;

  for (const wrongCh of chaptersWithQ) {
    const targetLdc = ldcChapterMap.get(wrongCh.name);
    if (!targetLdc) {
      console.log(`⚠️  No LDC chapter "${wrongCh.name}" found - skipping ${wrongCh.questions.length} questions`);
      continue;
    }

    console.log(`\n${wrongCh.name}: ${wrongCh.questions.length} questions in ${wrongCh.subject?.exam?.name} → moving to LDC`);

    const BATCH = 200;
    let moved = 0;
    for (let i = 0; i < wrongCh.questions.length; i += BATCH) {
      const batch = wrongCh.questions.slice(i, i + BATCH);
      await Promise.all(batch.map(q =>
        p.question.update({ where: { id: q.id }, data: { chapterId: targetLdc.id } })
      ));
      moved += batch.length;
    }

    console.log(`   ✅ Moved ${moved} questions`);
    totalMoved += moved;
  }

  console.log(`\n🔄 Total moved: ${totalMoved}`);

  // Verify LDC
  const ldcTotal = await p.question.count({ where: { chapter: { subject: { examId: ldc.id } } } });
  console.log(`\nLDC total questions: ${ldcTotal}`);

  const ldcChaps = await p.chapter.findMany({
    where: { subject: { examId: ldc.id } },
    include: { _count: { select: { questions: true } } },
    orderBy: { questions: { _count: 'desc' } }
  });

  console.log('\nLDC chapter breakdown:');
  for (const c of ldcChaps) {
    if (c._count.questions > 0) {
      console.log(`  ${c.name.padEnd(30)} ${c._count.questions}`);
    }
  }

  const empty = ldcChaps.filter(c => c._count.questions === 0);
  console.log(`\nLDC chapters with 0 questions (${empty.length}):`);
  for (const c of empty) console.log(`  ${c.name}`);

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
