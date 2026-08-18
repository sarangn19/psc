/**
 * One-time backfill: reads all existing QuestionAttempts and populates
 * UserConceptStat with accurate totals. Safe to re-run (upserts).
 *
 * Usage: node scripts/backfillConceptStats.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching all attempts...');
  const attempts = await prisma.questionAttempt.findMany({
    select: {
      userId: true,
      isCorrect: true,
      question: { select: { conceptId: true, chapterId: true } },
    },
  });

  console.log(`Processing ${attempts.length} attempts...`);

  // Aggregate in memory
  const conceptMap = new Map(); // key: userId|conceptId
  const chapterMap = new Map(); // key: userId|chapterId

  for (const a of attempts) {
    const conceptId = a.question.conceptId ?? null;
    const chapterId = a.question.chapterId;

    if (conceptId !== null) {
      const key = `${a.userId}|${conceptId}`;
      const s = conceptMap.get(key) || { userId: a.userId, conceptId, total: 0, correct: 0 };
      s.total++;
      if (a.isCorrect) s.correct++;
      conceptMap.set(key, s);
    } else {
      const key = `${a.userId}|${chapterId}`;
      const s = chapterMap.get(key) || { userId: a.userId, chapterId, total: 0, correct: 0 };
      s.total++;
      if (a.isCorrect) s.correct++;
      chapterMap.set(key, s);
    }
  }

  console.log(`Upserting ${conceptMap.size} concept stats + ${chapterMap.size} chapter stats...`);

  let done = 0;

  for (const r of conceptMap.values()) {
    await prisma.$executeRaw`
      INSERT INTO user_concept_stats (id, "userId", "conceptId", total, correct, "updatedAt")
      VALUES (gen_random_uuid()::text, ${r.userId}, ${r.conceptId}, ${r.total}, ${r.correct}, now())
      ON CONFLICT ("userId", "conceptId") WHERE "conceptId" IS NOT NULL
      DO UPDATE SET total = ${r.total}, correct = ${r.correct}, "updatedAt" = now()
    `;
    done++;
    if (done % 50 === 0) console.log(`  ${done} done...`);
  }

  for (const r of chapterMap.values()) {
    await prisma.$executeRaw`
      INSERT INTO user_concept_stats (id, "userId", "chapterId", total, correct, "updatedAt")
      VALUES (gen_random_uuid()::text, ${r.userId}, ${r.chapterId}, ${r.total}, ${r.correct}, now())
      ON CONFLICT ("userId", "chapterId") WHERE "chapterId" IS NOT NULL
      DO UPDATE SET total = ${r.total}, correct = ${r.correct}, "updatedAt" = now()
    `;
    done++;
    if (done % 50 === 0) console.log(`  ${done} done...`);
  }

  console.log('✅ Backfill complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
