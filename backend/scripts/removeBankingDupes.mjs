#!/usr/bin/env node
// Remove duplicate questions from banking exams (keep first occurrence)

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const bankingExams = await p.exam.findMany({ where: { category: 'Banking' } });

  for (const exam of bankingExams) {
    const chapters = await p.chapter.findMany({
      where: { subject: { examId: exam.id } }
    });

    let totalRemoved = 0;

    for (const ch of chapters) {
      // Find duplicate texts in this chapter
      const questions = await p.question.findMany({
        where: { chapterId: ch.id },
        select: { id: true, text: true },
        orderBy: { createdAt: 'asc' }
      });

      const seen = new Set();
      const dupes = [];
      for (const q of questions) {
        const norm = q.text.toLowerCase().trim();
        if (seen.has(norm)) {
          dupes.push(q.id);
        } else {
          seen.add(norm);
        }
      }

      if (dupes.length > 0) {
        await p.question.deleteMany({ where: { id: { in: dupes } } });
        totalRemoved += dupes.length;
      }
    }

    const finalCount = await p.question.count({
      where: { chapter: { subject: { examId: exam.id } } }
    });
    console.log(`${exam.name}: removed ${totalRemoved} dupes → ${finalCount} questions`);
  }

  await p.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
