#!/usr/bin/env node
// Copy newly added questions from IBPS PO to all other banking exams

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const ibps = await p.exam.findFirst({ where: { name: 'IBPS PO' } });
  const others = await p.exam.findMany({ where: { category: 'Banking', id: { not: ibps.id } } });

  // Get questions added recently (last 5 minutes)
  const recent = await p.question.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      chapter: { subject: { examId: ibps.id } }
    },
    select: {
      id: true, chapterId: true, conceptId: true, text: true, options: true,
      correctOption: true, explanation: true, difficulty: true, tags: true, isActive: true
    }
  });

  console.log(`Found ${recent.length} recently added questions in IBPS PO`);

  if (recent.length === 0) return;

  // Group by chapter
  const byChapter = new Map();
  for (const q of recent) {
    if (!byChapter.has(q.chapterId)) byChapter.set(q.chapterId, []);
    byChapter.get(q.chapterId).push(q);
  }

  let totalCopied = 0;

  for (const exam of others) {
    const examChapters = await p.chapter.findMany({ where: { subject: { examId: exam.id } } });
    const chapterMap = new Map();
    for (const ch of examChapters) chapterMap.set(ch.name, ch);

    // Get IBPS PO chapter names
    const ibpsChapters = await p.chapter.findMany({
      where: { id: { in: [...byChapter.keys()] } }
    });
    const ibpsChapterMap = new Map();
    for (const ch of ibpsChapters) ibpsChapterMap.set(ch.id, ch);

    let examCopied = 0;

    for (const [chapterId, questions] of byChapter) {
      const ibpsCh = ibpsChapterMap.get(chapterId);
      if (!ibpsCh) continue;

      const targetCh = chapterMap.get(ibpsCh.name);
      if (!targetCh) continue;

      const rows = questions.map(q => ({
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

      await p.question.createMany({ data: rows });
      examCopied += rows.length;
    }

    console.log(`  ${exam.name}: +${examCopied}`);
    totalCopied += examCopied;
  }

  console.log(`\nTotal copied: ${totalCopied}`);
  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
