#!/usr/bin/env node
// Copy all LDC questions to the other 5 exams by matching chapter names

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const ldcExam = await p.exam.findFirst({ where: { name: { contains: 'LDC' } } });
  const otherExams = await p.exam.findMany({ where: { id: { not: ldcExam.id } } });
  console.log(`LDC exam: ${ldcExam.name}`);
  console.log(`Target exams: ${otherExams.map(e => e.name).join(', ')}`);

  // Get LDC chapters with question counts
  const ldcChapters = await p.chapter.findMany({
    where: { subject: { examId: ldcExam.id } },
    include: { _count: { select: { questions: true } } }
  });
  console.log(`\nLDC chapters with questions:`);
  let totalToCopy = 0;
  for (const ch of ldcChapters) {
    if (ch._count.questions > 0) {
      console.log(`  ${ch.name}: ${ch._count.questions}`);
      totalToCopy += ch._count.questions;
    }
  }
  console.log(`Total to copy per exam: ${totalToCopy}`);
  console.log(`Total new records: ${totalToCopy * otherExams.length}`);

  // Build chapter name → LDC chapterId map
  const ldcChapterByName = new Map();
  for (const ch of ldcChapters) {
    ldcChapterByName.set(ch.name, ch);
  }

  // For each target exam, find matching chapters and copy questions
  let totalCopied = 0;
  const BATCH = 500;

  for (const exam of otherExams) {
    console.log(`\n📋 Processing ${exam.name}...`);

    // Get this exam's chapters
    const examChapters = await p.chapter.findMany({
      where: { subject: { examId: exam.id } }
    });
    const examChapterByName = new Map();
    for (const ch of examChapters) examChapterByName.set(ch.name, ch);

    let examCopied = 0;

    for (const ldcCh of ldcChapters) {
      if (ldcCh._count.questions === 0) continue;

      const targetCh = examChapterByName.get(ldcCh.name);
      if (!targetCh) {
        console.log(`  ⚠️  No matching chapter "${ldcCh.name}" in ${exam.name}`);
        continue;
      }

      // Fetch all questions in this LDC chapter
      const questions = await p.question.findMany({
        where: { chapterId: ldcCh.id },
        select: {
          conceptId: true, text: true, options: true, correctOption: true,
          explanation: true, difficulty: true, tags: true, isActive: true
        }
      });

      // Batch insert copies
      for (let i = 0; i < questions.length; i += BATCH) {
        const batch = questions.slice(i, i + BATCH).map(q => ({
          chapterId: targetCh.id,
          conceptId: q.conceptId,
          text: q.text,
          options: q.options,
          correctOption: q.correctOption,
          explanation: q.explanation,
          difficulty: q.difficulty,
          tags: q.tags,
          isActive: q.isActive
        }));
        await p.question.createMany({ data: batch });
        examCopied += batch.length;
      }
    }

    console.log(`  ✅ Copied ${examCopied} questions to ${exam.name}`);
    totalCopied += examCopied;
  }

  console.log(`\n🎉 Total copied: ${totalCopied} new questions`);

  // Verify
  const finalTotal = await p.question.count();
  console.log(`Total questions in DB: ${finalTotal}`);

  // Per-exam summary
  for (const exam of [ldcExam, ...otherExams]) {
    const count = await p.question.count({
      where: { chapter: { subject: { examId: exam.id } } }
    });
    console.log(`  ${exam.name}: ${count} questions`);
  }

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
