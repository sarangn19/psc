import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const TOTAL_QUESTIONS = 200;
const SNAPSHOT_INTERVAL = 50;
const CANDIDATE_BATCH_SIZE = 250;

const CONCEPT_X_CHAPTER_ID = 'banking-ch-quantitative-aptitude';
const CONCEPT_Y_CHAPTER_ID = 'banking-ch-reasoning-ability';

const DIFFICULTY_ORDER = { EASY: 0, MEDIUM: 1, HARD: 2 };
const MASTERY_ACCURACY = 0.8;
const MIN_ATTEMPTS_FOR_MASTERY = 5;

async function getOrCreateUser(email, name) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.adaptiveItem.deleteMany({ where: { session: { userId: existing.id } } });
    await prisma.adaptiveSession.deleteMany({ where: { userId: existing.id } });
    await prisma.questionAttempt.deleteMany({ where: { userId: existing.id } });
    await prisma.userConceptStat.deleteMany({ where: { userId: existing.id } });
    await prisma.userChapter.deleteMany({ where: { userId: existing.id } });
    await prisma.userActivity.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }
  const hashed = await bcrypt.hash('simtest123', 10);
  return prisma.user.create({ data: { email, name, password: hashed } });
}

async function markChapterLearned(userId, chapterId) {
  await prisma.userChapter.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    update: { isLearned: true },
    create: { userId, chapterId, isLearned: true },
  });
}

async function fetchCandidates(chapterIds) {
  const questions = await prisma.$queryRaw`
    SELECT q.id, q."conceptId", q."chapterId", q.difficulty, q."correctOption", q.options, c.name as "chapterName"
    FROM questions q
    JOIN chapters c ON c.id = q."chapterId"
    WHERE q."isActive" = true
    AND q."chapterId" IN (${Prisma.join(chapterIds)})
    ORDER BY RANDOM()
    LIMIT ${CANDIDATE_BATCH_SIZE}
  `;
  return questions.map((q) => ({
    id: q.id,
    conceptId: q.conceptId,
    chapterId: q.chapterId,
    difficulty: q.difficulty,
    correctOption: q.correctOption,
    options: q.options,
    chapter: { name: q.chapterName },
  }));
}

function rankGroups(questions, stats) {
  const groups = new Map();
  for (const q of questions) {
    const key = q.conceptId !== null ? `concept:${q.conceptId}` : `chapter:${q.chapterId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }

  return [...groups.entries()].map(([key, questions]) => {
    const s = stats.get(key) || { total: 0, correct: 0 };
    const accuracy = s.total > 0 ? s.correct / s.total : 0;
    questions.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
    return {
      key,
      questions,
      accuracy,
      total: s.total,
      mastery: s.total >= MIN_ATTEMPTS_FOR_MASTERY && accuracy >= MASTERY_ACCURACY,
      sortKey: questions[0].conceptId !== null ? questions[0].conceptId : Infinity,
    };
  }).sort((a, b) => {
    if (a.mastery !== b.mastery) return Number(a.mastery) - Number(b.mastery);
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    if (a.total !== b.total) return a.total - b.total;
    return a.sortKey - b.sortKey;
  });
}

function shouldAnswerCorrect(userProfile, questionNumber, conceptKey) {
  if (userProfile === 'A') {
    if (conceptKey === 'strong') return Math.random() < 0.90;
    if (conceptKey === 'weak') return Math.random() < 0.10;
    return Math.random() < 0.50;
  }
  if (userProfile === 'B') return Math.random() < 0.50;
  if (userProfile === 'C') {
    const accuracy = 0.20 + Math.floor((questionNumber - 1) / 20) * 0.01;
    return Math.random() < accuracy;
  }
  return Math.random() < 0.50;
}

async function runUserSimulation(user, userProfile) {
  const chapterIds = [CONCEPT_X_CHAPTER_ID, CONCEPT_Y_CHAPTER_ID];
  const stats = new Map();
  const seenIds = new Set();
  const conceptCounts = { strong: 0, weak: 0, other: 0 };
  const masterySnapshots = [];
  const servedConcepts = [];
  let correctCount = 0;
  let totalAnswered = 0;

  while (totalAnswered < TOTAL_QUESTIONS) {
    const candidates = await fetchCandidates(chapterIds);
    const unseen = candidates.filter((q) => !seenIds.has(q.id));

    if (unseen.length === 0) break;

    const ranked = rankGroups(unseen, stats);
    const chosen = ranked[0].questions[0];

    seenIds.add(chosen.id);
    const conceptKey = chosen.chapterId === CONCEPT_X_CHAPTER_ID ? 'strong'
      : chosen.chapterId === CONCEPT_Y_CHAPTER_ID ? 'weak' : 'other';

    conceptCounts[conceptKey]++;
    servedConcepts.push({
      questionNumber: totalAnswered + 1,
      conceptKey,
      chapterName: chosen.chapter.name,
      difficulty: chosen.difficulty,
    });

    const isCorrect = shouldAnswerCorrect(userProfile, totalAnswered + 1, conceptKey);
    if (isCorrect) correctCount++;
    totalAnswered++;

    const statsKey = chosen.conceptId !== null ? `concept:${chosen.conceptId}` : `chapter:${chosen.chapterId}`;
    const current = stats.get(statsKey) || { total: 0, correct: 0 };
    current.total++;
    if (isCorrect) current.correct++;
    stats.set(statsKey, current);

    if (totalAnswered % SNAPSHOT_INTERVAL === 0) {
      const snapshot = {};
      for (const [key, val] of stats) {
        const accuracy = val.total > 0 ? val.correct / val.total : 0;
        snapshot[key] = {
          total: val.total,
          correct: val.correct,
          accuracy: Math.round(accuracy * 1000) / 10,
          mastery: val.total >= MIN_ATTEMPTS_FOR_MASTERY && accuracy >= MASTERY_ACCURACY,
        };
      }
      masterySnapshots.push({ questionNumber: totalAnswered, stats: snapshot });
    }
  }

  for (const [key, val] of stats) {
    if (key.startsWith('chapter:')) {
      const chapterId = key.replace('chapter:', '');
      await prisma.userConceptStat.upsert({
        where: { userId_chapterId: { userId: user.id, chapterId } },
        update: { total: val.total, correct: val.correct },
        create: { userId: user.id, chapterId, total: val.total, correct: val.correct },
      });
    }
  }

  return {
    conceptCounts,
    masterySnapshots,
    servedConcepts,
    correctCount,
    totalAnswered,
    uniqueQuestionCount: seenIds.size,
  };
}

function printReport(userLabel, profile, results) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`USER ${userLabel} (Profile: ${profile})`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\nTotal answered: ${results.totalAnswered}, Correct: ${results.correctCount} (${Math.round(results.correctCount / results.totalAnswered * 100)}%)`);
  console.log(`Unique questions: ${results.uniqueQuestionCount} / ${results.totalAnswered} (${Math.round(results.uniqueQuestionCount / results.totalAnswered * 100)}% unique)`);

  console.log(`\nConcept distribution:`);
  console.log(`  Strong (Concept X - Quantitative Aptitude): ${results.conceptCounts.strong} (${Math.round(results.conceptCounts.strong / results.totalAnswered * 100)}%)`);
  console.log(`  Weak   (Concept Y - Reasoning Ability):     ${results.conceptCounts.weak} (${Math.round(results.conceptCounts.weak / results.totalAnswered * 100)}%)`);
  if (results.conceptCounts.other > 0) {
    console.log(`  Other: ${results.conceptCounts.other} (${Math.round(results.conceptCounts.other / results.totalAnswered * 100)}%)`);
  }

  console.log(`\nMastery progression (every ${SNAPSHOT_INTERVAL} questions):`);
  for (const snap of results.masterySnapshots) {
    console.log(`  After Q${snap.questionNumber}:`);
    for (const [key, val] of Object.entries(snap.stats)) {
      const label = key.includes(CONCEPT_X_CHAPTER_ID) ? 'Concept X (Quant)' :
                    key.includes(CONCEPT_Y_CHAPTER_ID) ? 'Concept Y (Reason)' : key;
      console.log(`    ${label}: total=${val.total} correct=${val.correct} accuracy=${val.accuracy}% mastery=${val.mastery}`);
    }
  }

  const half = Math.floor(results.totalAnswered / 2);
  const firstHalf = results.servedConcepts.slice(0, half);
  const secondHalf = results.servedConcepts.slice(half);
  const firstWeak = firstHalf.filter((c) => c.conceptKey === 'weak').length;
  const secondWeak = secondHalf.filter((c) => c.conceptKey === 'weak').length;
  const firstPct = firstHalf.length > 0 ? Math.round(firstWeak / firstHalf.length * 100) : 0;
  const secondPct = secondHalf.length > 0 ? Math.round(secondWeak / secondHalf.length * 100) : 0;
  console.log(`\nWeak concept targeting over time:`);
  console.log(`  First half:  weak=${firstWeak}/${firstHalf.length} (${firstPct}%)`);
  console.log(`  Second half: weak=${secondWeak}/${secondHalf.length} (${secondPct}%)`);

  const streaks = [];
  let currentStreak = 1;
  for (let i = 1; i < results.servedConcepts.length; i++) {
    if (results.servedConcepts[i].conceptKey === results.servedConcepts[i - 1].conceptKey) {
      currentStreak++;
    } else {
      streaks.push({ concept: results.servedConcepts[i - 1].conceptKey, length: currentStreak });
      currentStreak = 1;
    }
  }
  if (results.servedConcepts.length > 0) {
    streaks.push({ concept: results.servedConcepts[results.servedConcepts.length - 1].conceptKey, length: currentStreak });
  }
  const maxStreak = Math.max(...streaks.map((s) => s.length), 0);
  console.log(`\nMax consecutive same-concept streak: ${maxStreak}`);
  if (maxStreak > 25) {
    console.log(`  WARNING: Selection may be stuck (streak > 25)`);
  }

  const last20 = results.servedConcepts.slice(-20);
  const last20Weak = last20.filter((c) => c.conceptKey === 'weak').length;
  console.log(`\nLast 20 questions: weak=${last20Weak}, strong=${20 - last20Weak}`);
}

async function setupAndRunUser(u) {
  const user = await getOrCreateUser(u.email, u.name);
  await markChapterLearned(user.id, CONCEPT_X_CHAPTER_ID);
  await markChapterLearned(user.id, CONCEPT_Y_CHAPTER_ID);
  const results = await runUserSimulation(user, u.profile);
  return { label: u.label, profile: u.profile, results, email: u.email };
}

async function main() {
  console.log('=== Kerala PSC Adaptive Engine Simulation ===\n');
  console.log(`Start time: ${new Date().toISOString()}`);

  const chapX = await prisma.chapter.findUnique({ where: { id: CONCEPT_X_CHAPTER_ID } });
  const chapY = await prisma.chapter.findUnique({ where: { id: CONCEPT_Y_CHAPTER_ID } });
  if (!chapX || !chapY) {
    console.error('Required chapters not found');
    process.exit(1);
  }
  console.log(`Concept X (strong): ${chapX.name} (${CONCEPT_X_CHAPTER_ID})`);
  console.log(`Concept Y (weak):   ${chapY.name} (${CONCEPT_Y_CHAPTER_ID})`);
  console.log(`Note: Taxonomy is empty; using chapters as concept equivalents.`);
  console.log(`Note: Using Prisma directly due to API latency (~4s/question).\n`);

  const users = [
    { email: 'sim_user_a@test.local', name: 'SIM_USER_A', profile: 'A', label: 'A' },
    { email: 'sim_user_b@test.local', name: 'SIM_USER_B', profile: 'B', label: 'B' },
    { email: 'sim_user_c@test.local', name: 'SIM_USER_C', profile: 'C', label: 'C' },
  ];

  console.log('Running all 3 users in parallel...');
  const allResults = await Promise.all(users.map((u) => setupAndRunUser(u)));

  for (const r of allResults) {
    printReport(r.label, r.profile, r.results);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('CROSS-USER COMPARISON');
  console.log(`${'='.repeat(70)}`);

  for (const r of allResults) {
    const res = r.results;
    const weakPct = Math.round(res.conceptCounts.weak / res.totalAnswered * 100);
    const strongPct = Math.round(res.conceptCounts.strong / res.totalAnswered * 100);
    console.log(`User ${r.label}: weak=${weakPct}% strong=${strongPct}% accuracy=${Math.round(res.correctCount / res.totalAnswered * 100)}% unique=${res.uniqueQuestionCount}/${res.totalAnswered}`);
  }

  const aResults = allResults.find((r) => r.label === 'A').results;
  const half = Math.floor(aResults.totalAnswered / 2);
  const aFirstHalf = aResults.servedConcepts.slice(0, half).filter((c) => c.conceptKey === 'weak').length;
  const aSecondHalf = aResults.servedConcepts.slice(half).filter((c) => c.conceptKey === 'weak').length;
  const aFirstPct = half > 0 ? Math.round(aFirstHalf / half * 100) : 0;
  const aSecondPct = Math.ceil(aResults.totalAnswered / 2) > 0 ? Math.round(aSecondHalf / Math.ceil(aResults.totalAnswered / 2) * 100) : 0;
  console.log(`\nUser A weak-concept targeting trend:`);
  console.log(`  First half:  ${aFirstPct}% weak`);
  console.log(`  Second half: ${aSecondPct}% weak`);
  if (aSecondPct > aFirstPct) {
    console.log(`  -> Weak concept was targeted MORE over time (good adaptive behavior)`);
  } else if (aSecondPct < aFirstPct) {
    console.log(`  -> Weak concept was targeted LESS over time (potential issue)`);
  } else {
    console.log(`  -> No change in weak concept targeting`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('CLEANUP');
  console.log(`${'='.repeat(70)}`);
  for (const r of allResults) {
    const user = await prisma.user.findUnique({ where: { email: r.email } });
    if (user) {
      await prisma.adaptiveItem.deleteMany({ where: { session: { userId: user.id } } });
      await prisma.adaptiveSession.deleteMany({ where: { userId: user.id } });
      await prisma.questionAttempt.deleteMany({ where: { userId: user.id } });
      await prisma.userConceptStat.deleteMany({ where: { userId: user.id } });
      await prisma.userChapter.deleteMany({ where: { userId: user.id } });
      await prisma.userActivity.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      console.log(`  Deleted ${r.email}`);
    }
  }

  await prisma.$disconnect();
  console.log(`\nEnd time: ${new Date().toISOString()}`);
  console.log('Simulation complete.');
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
