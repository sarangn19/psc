// Simulation of adaptive question selection vs random baseline
// STEP A2: Realistic learning model (lower gains, forgetting, cap 0.98)
// Re-implementation of adaptive.ts logic using fake in-memory data
// Run with: node backend/sim/run-simulation.mjs

import { writeFileSync } from 'fs';

// ============================================================
// SEEDED RNG (mulberry32) - reproducible
// ============================================================
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// LEARNING MODEL (documented — exact values)
// ============================================================
// Per-answer knowledge gain rules:
//   - On CORRECT answer:  knowledge[X] += 0.006 * learnRate
//   - On WRONG answer:    knowledge[X] += 0.003 * learnRate  (explanation shown)
//   - learnRate: User A=1.0, User B=0.0 (no learning), User C=0.5 (slow), User D=1.0
//   - Knowledge is capped at 0.98 (never reaches 1.0)
//   - Difficulty adjustment to P(correct): EASY +0.10, MEDIUM +0.00, HARD -0.10
//   - P(correct) = clamp(conceptKnowledge + difficultyAdjustment, 0, 1)
// Forgetting rule:
//   - After every answer served from concept X, every OTHER concept Y (Y != X)
//     decays: knowledge[Y] = knowledge[Y] * 0.9985
//   - Floor: knowledge[Y] never drops below the user's starting level (baseKnowledge[Y])
// ============================================================

const LEARNING_RATE_CORRECT = 0.006;
const LEARNING_RATE_WRONG = 0.003;
const KNOWLEDGE_CAP = 0.98;
const FORGETTING_FACTOR = 0.9985;
const DIFFICULTY_ADJUSTMENT = { EASY: 0.10, MEDIUM: 0.00, HARD: -0.10 };

// ============================================================
// CONCEPTS
// ============================================================
const CONCEPTS = [
  { id: 1, name: 'Concept 1' },
  { id: 2, name: 'Concept 2' },
  { id: 3, name: 'Concept 3' },
  { id: 4, name: 'Concept 4' },
  { id: 5, name: 'Concept 5' },
  { id: 6, name: 'Concept 6' },
];

// ============================================================
// QUESTION BANK GENERATOR
// ============================================================
function generateBank(questionsPerConcept) {
  const bank = [];
  let qid = 1;
  for (const c of CONCEPTS) {
    const n = questionsPerConcept;
    const nEasy = Math.floor(n / 3);
    const nMedium = Math.floor(n / 3);
    const nHard = n - nEasy - nMedium;
    for (let i = 0; i < nEasy; i++) bank.push({ id: qid++, conceptId: c.id, difficulty: 'EASY' });
    for (let i = 0; i < nMedium; i++) bank.push({ id: qid++, conceptId: c.id, difficulty: 'MEDIUM' });
    for (let i = 0; i < nHard; i++) bank.push({ id: qid++, conceptId: c.id, difficulty: 'HARD' });
  }
  return bank;
}

// ============================================================
// SIMULATED USERS
// ============================================================
const USERS = {
  A: { label: 'User A', baseKnowledge: new Map(CONCEPTS.map(c => [c.id, c.id <= 3 ? 0.85 : 0.30])), learnRate: 1.0 },
  B: { label: 'User B', baseKnowledge: new Map(CONCEPTS.map(c => [c.id, 0.25])), learnRate: 0.0 },
  C: { label: 'User C', baseKnowledge: new Map(CONCEPTS.map(c => [c.id, 0.30])), learnRate: 0.5 },
  D: { label: 'User D', baseKnowledge: new Map(CONCEPTS.map(c => [c.id, 0.55])), learnRate: 1.0 },
};

// ============================================================
// ADAPTIVE SELECTION LOGIC (re-implemented from adaptive.ts)
// ============================================================
const DIFFICULTY_ORDER = { EASY: 0, MEDIUM: 1, HARD: 2 };

function rankGroups(candidates, stats) {
  const groups = new Map();
  for (const c of candidates) {
    const key = `concept:${c.conceptId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.entries()].map(([key, questions]) => {
    const s = stats.get(key) || { total: 0, correct: 0 };
    const accuracy = s.total > 0 ? s.correct / s.total : 0;
    questions.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
    return {
      key, questions, accuracy, total: s.total,
      mastery: s.total >= 5 && accuracy >= 0.8,
      sortKey: questions[0]?.conceptId ?? Infinity,
    };
  }).sort((a, b) => {
    if (a.mastery !== b.mastery) return Number(a.mastery) - Number(b.mastery);
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    if (a.total !== b.total) return a.total - b.total;
    return a.sortKey - b.sortKey;
  });
}

// Current picker (same as adaptive.ts logic)
function adaptivePick(candidates, seenIds, statsMap, rng) {
  const unseen = candidates.filter(q => !seenIds.has(q.id));
  if (unseen.length === 0) return null;
  const ranked = rankGroups(unseen, statsMap);
  if (ranked.length === 0) return null;
  return ranked[0].questions[0];
}

// Random picker (uniform)
function randomPick(candidates, seenIds, statsMap, rng) {
  const unseen = candidates.filter(q => !seenIds.has(q.id));
  if (unseen.length === 0) return null;
  return unseen[Math.floor(rng() * unseen.length)];
}

// ============================================================
// SIMULATE ONE USER + ONE PICKER (with forgetting)
// ============================================================
function simulateUser(userConfig, picker, seed, questionBank, totalAnswers) {
  const rng = mulberry32(seed);
  const knowledge = new Map(userConfig.baseKnowledge);
  const correctPerConcept = new Map(CONCEPTS.map(c => [c.id, 0]));
  const totalPerConcept = new Map(CONCEPTS.map(c => [c.id, 0]));
  const statsMap = new Map();
  const seenIds = new Set();
  const history = [];
  const answerTimes = [];

  for (let i = 0; i < totalAnswers; i++) {
    const t0 = process.hrtime.bigint();
    const q = picker(questionBank, seenIds, statsMap, rng);
    const t1 = process.hrtime.bigint();
    answerTimes.push(Number(t1 - t0) / 1e6);

    if (!q) break;

    seenIds.add(q.id);
    const conceptKnowledge = knowledge.get(q.conceptId) ?? 0.5;
    const diffAdj = DIFFICULTY_ADJUSTMENT[q.difficulty];
    const prob = Math.max(0, Math.min(1, conceptKnowledge + diffAdj));
    const correct = rng() < prob;

    correctPerConcept.set(q.conceptId, (correctPerConcept.get(q.conceptId) || 0) + (correct ? 1 : 0));
    totalPerConcept.set(q.conceptId, (totalPerConcept.get(q.conceptId) || 0) + 1);
    const key = `concept:${q.conceptId}`;
    const s = statsMap.get(key) || { total: 0, correct: 0 };
    s.total += 1;
    if (correct) s.correct += 1;
    statsMap.set(key, s);

    // Learning on the answered concept X
    if (userConfig.learnRate > 0) {
      const delta = correct ? LEARNING_RATE_CORRECT * userConfig.learnRate : LEARNING_RATE_WRONG * userConfig.learnRate;
      knowledge.set(q.conceptId, Math.min(KNOWLEDGE_CAP, (knowledge.get(q.conceptId) ?? 0.5) + delta));
    }

    // Forgetting: every OTHER concept decays slightly, floored at starting level
    for (const c of CONCEPTS) {
      if (c.id === q.conceptId) continue;
      const base = userConfig.baseKnowledge.get(c.id);
      const current = knowledge.get(c.id) ?? base;
      const decayed = current * FORGETTING_FACTOR;
      knowledge.set(c.id, Math.max(base, decayed));
    }

    history.push({ questionId: q.id, conceptId: q.conceptId, difficulty: q.difficulty, correct, order: i + 1 });
  }

  return { history, knowledge, correctPerConcept, totalPerConcept, statsMap, answerTimes, seenIds };
}

// ============================================================
// METRICS
// ============================================================
function computeMetrics(result, userConfig, label, pickerName, totalAnswers) {
  const { history, knowledge, correctPerConcept, totalPerConcept, answerTimes } = result;
  const total = history.length;

  // Windows: 1-50, 51-100, 101-200, 201-300 (for 1000-answer runs, 201-300 covers 201-end)
  const windowDefs = [['1-50', 1, 50], ['51-100', 51, 100], ['101-200', 101, 200], ['201-300', 201, totalAnswers]];
  const windows = {};
  for (const [wn, lo, hi] of windowDefs) windows[wn] = [];
  for (const h of history) {
    for (const [wn, lo, hi] of windowDefs) {
      if (h.order >= lo && h.order <= hi) { windows[wn].push(h); break; }
    }
  }

  // 1. Share of questions per concept in windows
  const shareByWindow = {};
  for (const [wn, hs] of Object.entries(windows)) {
    const counts = new Map(CONCEPTS.map(c => [c.id, 0]));
    for (const h of hs) counts.set(h.conceptId, (counts.get(h.conceptId) || 0) + 1);
    shareByWindow[wn] = {};
    for (const [cid, cnt] of counts) shareByWindow[wn][cid] = hs.length > 0 ? +(cnt / hs.length).toFixed(3) : 0;
  }

  // 2. Longest streak of consecutive questions from same concept
  let maxStreak = 0, curStreak = 0, lastConcept = null;
  for (const h of history) {
    if (h.conceptId === lastConcept) { curStreak++; } else { curStreak = 1; lastConcept = h.conceptId; }
    if (curStreak > maxStreak) maxStreak = curStreak;
  }

  // 3. Repeat count and min gap
  const questionSeenCount = new Map();
  const questionLastSeen = new Map();
  let repeats = 0, minGap = Infinity;
  for (const h of history) {
    if (questionSeenCount.has(h.questionId)) {
      repeats++;
      const gap = h.order - questionLastSeen.get(h.questionId);
      if (gap < minGap) minGap = gap;
    }
    questionSeenCount.set(h.questionId, (questionSeenCount.get(h.questionId) || 0) + 1);
    questionLastSeen.set(h.questionId, h.order);
  }

  // 4. Wrong answers that resurfaced later, and gap
  const wrongFirstSeen = new Map();
  for (const h of history) {
    if (!h.correct && !wrongFirstSeen.has(h.questionId)) {
      wrongFirstSeen.set(h.questionId, h.order);
    }
  }
  const wrongResurfaced = [];
  for (const [qid, firstOrder] of wrongFirstSeen) {
    const later = history.find(x => x.questionId === qid && x.order > firstOrder);
    if (later) wrongResurfaced.push({ questionId: qid, firstOrder, laterOrder: later.order, gap: later.order - firstOrder });
  }

  // 5. Estimated mastery per concept vs TRUE knowledge at END of run
  const estimatedMastery = {};
  for (const c of CONCEPTS) {
    const tot = totalPerConcept.get(c.id) || 0;
    const cor = correctPerConcept.get(c.id) || 0;
    const est = tot > 0 ? cor / tot : 0;
    const trueKEnd = knowledge.get(c.id);
    estimatedMastery[c.id] = { estimated: +est.toFixed(3), trueEnd: +trueKEnd.toFixed(3), diff: +(est - trueKEnd).toFixed(3) };
  }

  // 6. Overall accuracy per window + by difficulty
  const accuracyByWindow = {};
  for (const [wn, hs] of Object.entries(windows)) {
    if (hs.length === 0) { accuracyByWindow[wn] = null; continue; }
    const correctCount = hs.filter(h => h.correct).length;
    accuracyByWindow[wn] = +(correctCount / hs.length).toFixed(3);
  }
  const accuracyByDifficulty = { EASY: null, MEDIUM: null, HARD: null };
  for (const d of ['EASY', 'MEDIUM', 'HARD']) {
    const dh = history.filter(h => h.difficulty === d);
    if (dh.length > 0) accuracyByDifficulty[d] = +(dh.filter(h => h.correct).length / dh.length).toFixed(3);
  }

  // 7. Share: exploration vs weak-focused vs review
  let exploration = 0, weakFocused = 0, review = 0;
  const conceptAccuracyAt = new Map();
  for (const h of history) {
    const key = h.conceptId;
    const cur = conceptAccuracyAt.get(key) || { total: 0, correct: 0 };
    const accBefore = cur.total > 0 ? cur.correct / cur.total : 0;
    if (cur.total === 0) exploration++;
    else if (accBefore < 0.4) weakFocused++;
    else if (accBefore >= 0.7) review++;
    cur.total++; if (h.correct) cur.correct++;
    conceptAccuracyAt.set(key, cur);
  }
  const totalClassified = exploration + weakFocused + review;
  const shareBreakdown = totalClassified > 0 ? {
    exploration: +(exploration / totalClassified).toFixed(3),
    weakFocused: +(weakFocused / totalClassified).toFixed(3),
    review: +(review / totalClassified).toFixed(3),
  } : { exploration: 0, weakFocused: 0, review: 0 };

  // 8. Final true knowledge gain per user (from base to end)
  const finalKnowledgeGain = {};
  for (const c of CONCEPTS) {
    const start = userConfig.baseKnowledge.get(c.id);
    const end = knowledge.get(c.id) ?? start;
    finalKnowledgeGain[c.id] = +(end - start).toFixed(4);
  }

  // Final mean knowledge across concepts (at END)
  const finalMeanKnowledge = mean(CONCEPTS.map(c => knowledge.get(c.id) ?? 0));

  // 9. Time per selection call (ms), avg and worst
  const avgTime = answerTimes.length > 0 ? +(answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length).toFixed(4) : 0;
  const worstTime = answerTimes.length > 0 ? +Math.max(...answerTimes).toFixed(4) : 0;

  // 10. Edge cases
  const allConceptsAnswered = CONCEPTS.every(c => (totalPerConcept.get(c.id) || 0) > 0);
  const conceptWithNoQuestions = CONCEPTS.filter(c => (totalPerConcept.get(c.id) || 0) === 0).map(c => c.id);

  // Cold-start: first 30 questions distribution across concepts
  const first30 = history.slice(0, 30);
  const coldStartDist = {};
  for (const c of CONCEPTS) {
    coldStartDist[c.id] = first30.filter(h => h.conceptId === c.id).length;
  }

  return {
    label, pickerName, total,
    shareByWindow, maxStreak, repeats, minGap: minGap === Infinity ? null : minGap,
    wrongResurfacedCount: wrongResurfaced.length, wrongResurfacedAvgGap: wrongResurfaced.length > 0 ? +(wrongResurfaced.reduce((a, b) => a + b.gap, 0) / wrongResurfaced.length).toFixed(1) : null,
    estimatedMastery, accuracyByWindow, accuracyByDifficulty, shareBreakdown,
    finalKnowledgeGain, finalMeanKnowledge: +finalMeanKnowledge.toFixed(4),
    avgTime, worstTime, allConceptsAnswered, conceptWithNoQuestions,
    coldStartDist,
  };
}

// ============================================================
// STATISTICS HELPERS
// ============================================================
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function sd(arr) {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
function meanSd(arr) {
  return { mean: +mean(arr).toFixed(4), sd: +sd(arr).toFixed(4) };
}

// ============================================================
// RUN ALL SIMULATIONS WITH 20 SEEDS
// ============================================================
const NUM_SEEDS = 20;
const SEED_BASE = 12345;

// Scenarios:
//   LARGE: 200/concept = 1200 total, 300 answers (bank never exhausted)
//   SMALL_BANK_LONG: 40/concept = 240 total, 1000 answers (repeats CAN happen)
const SCENARIOS = [
  { name: 'LARGE', questionsPerConcept: 200, totalAnswers: 300 },
  { name: 'SMALL_BANK_LONG', questionsPerConcept: 40, totalAnswers: 1000 },
];

const allResults = {};

for (const scenario of SCENARIOS) {
  const questionBank = generateBank(scenario.questionsPerConcept);
  const scenarioResults = [];

  for (const [userKey, userConfig] of Object.entries(USERS)) {
    for (const [pickerName, picker] of [['adaptive', adaptivePick], ['random', randomPick]]) {
      const runMetrics = [];
      for (let s = 0; s < NUM_SEEDS; s++) {
        const seed = SEED_BASE + s * 1000 + scenarioResults.length;
        const sim = simulateUser(userConfig, picker, seed, questionBank, scenario.totalAnswers);
        const metrics = computeMetrics(sim, userConfig, userConfig.label, pickerName, scenario.totalAnswers);
        runMetrics.push(metrics);
      }
      scenarioResults.push({ user: userConfig.label, picker: pickerName, runs: runMetrics });
    }
  }
  allResults[scenario.name] = { questionsPerConcept: scenario.questionsPerConcept, totalAnswers: scenario.totalAnswers, totalQuestions: questionBank.length, results: scenarioResults };
}

// ============================================================
// AGGREGATE: mean +/- sd for every metric
// ============================================================
function aggregateRunMetrics(runs) {
  const maxStreaks = runs.map(r => r.maxStreak);
  const repeatsArr = runs.map(r => r.repeats);
  const minGaps = runs.map(r => r.minGap).filter(x => x !== null);
  const wrongResurfacedCounts = runs.map(r => r.wrongResurfacedCount);
  const wrongResurfacedAvgGaps = runs.map(r => r.wrongResurfacedAvgGap).filter(x => x !== null);
  const avgTimes = runs.map(r => r.avgTime);
  const worstTimes = runs.map(r => r.worstTime);
  const finalMeanKnowledges = runs.map(r => r.finalMeanKnowledge);

  // Accuracy by window
  const accWindows = {};
  const windowKeys = Object.keys(runs[0].accuracyByWindow);
  for (const wn of windowKeys) {
    accWindows[wn] = meanSd(runs.map(r => r.accuracyByWindow[wn]).filter(x => x !== null));
  }

  // Accuracy by difficulty
  const accDiff = {};
  for (const d of ['EASY', 'MEDIUM', 'HARD']) {
    accDiff[d] = meanSd(runs.map(r => r.accuracyByDifficulty[d]).filter(x => x !== null));
  }

  // Share breakdown
  const shareExp = meanSd(runs.map(r => r.shareBreakdown.exploration));
  const shareWeak = meanSd(runs.map(r => r.shareBreakdown.weakFocused));
  const shareReview = meanSd(runs.map(r => r.shareBreakdown.review));

  // Final knowledge gain per concept
  const gainPerConcept = {};
  for (const c of CONCEPTS) {
    gainPerConcept[c.id] = meanSd(runs.map(r => r.finalKnowledgeGain[c.id]));
  }

  // Estimated mastery vs true knowledge (at end) per concept
  const masteryPerConcept = {};
  for (const c of CONCEPTS) {
    masteryPerConcept[c.id] = {
      estimated: meanSd(runs.map(r => r.estimatedMastery[c.id].estimated)),
      trueEnd: meanSd(runs.map(r => r.estimatedMastery[c.id].trueEnd)),
      diff: meanSd(runs.map(r => r.estimatedMastery[c.id].diff)),
    };
  }

  // Share by window per concept (mean only)
  const shareByWindowPerConcept = {};
  for (const wn of windowKeys) {
    shareByWindowPerConcept[wn] = {};
    for (const c of CONCEPTS) {
      shareByWindowPerConcept[wn][c.id] = +mean(runs.map(r => r.shareByWindow[wn][c.id])).toFixed(3);
    }
  }

  // Cold start distribution (first 30 questions)
  const coldStartDist = {};
  for (const c of CONCEPTS) {
    coldStartDist[c.id] = meanSd(runs.map(r => r.coldStartDist[c.id]));
  }

  return {
    maxStreak: meanSd(maxStreaks),
    repeats: meanSd(repeatsArr),
    minGap: minGaps.length > 0 ? meanSd(minGaps) : null,
    wrongResurfacedCount: meanSd(wrongResurfacedCounts),
    wrongResurfacedAvgGap: wrongResurfacedAvgGaps.length > 0 ? meanSd(wrongResurfacedAvgGaps) : null,
    avgTime: meanSd(avgTimes),
    worstTime: meanSd(worstTimes),
    finalMeanKnowledge: meanSd(finalMeanKnowledges),
    accuracyByWindow: accWindows,
    accuracyByDifficulty: accDiff,
    shareBreakdown: { exploration: shareExp, weakFocused: shareWeak, review: shareReview },
    finalKnowledgeGain: gainPerConcept,
    estimatedMastery: masteryPerConcept,
    shareByWindowPerConcept,
    coldStartDist,
    total: mean(runs.map(r => r.total)),
  };
}

// Build aggregated report
const aggregatedReport = {
  generatedAt: new Date().toISOString(),
  seedBase: SEED_BASE,
  numSeeds: NUM_SEEDS,
  learningModel: {
    correctGain: LEARNING_RATE_CORRECT,
    wrongGain: LEARNING_RATE_WRONG,
    knowledgeCap: KNOWLEDGE_CAP,
    forgettingFactor: FORGETTING_FACTOR,
    forgettingFloor: 'user starting level (baseKnowledge)',
    difficultyAdjustment: DIFFICULTY_ADJUSTMENT,
    learnRates: { A: 1.0, B: 0.0, C: 0.5, D: 1.0 },
    note: 'Knowledge compared at END of run (after learning+forgetting), not start',
  },
  scenarios: {},
};

for (const [scenarioName, scenarioData] of Object.entries(allResults)) {
  aggregatedReport.scenarios[scenarioName] = {
    questionsPerConcept: scenarioData.questionsPerConcept,
    totalAnswers: scenarioData.totalAnswers,
    totalQuestions: scenarioData.totalQuestions,
    results: {},
  };
  for (const res of scenarioData.results) {
    const key = `${res.user}|${res.picker}`;
    aggregatedReport.scenarios[scenarioName].results[key] = aggregateRunMetrics(res.runs);
  }
}

writeFileSync('backend/sim/report.json', JSON.stringify(aggregatedReport, null, 2));
console.log('Simulation complete. Report written to backend/sim/report.json');
console.log(`Scenarios: ${SCENARIOS.map(s => s.name + ' (' + s.questionsPerConcept + '/concept, ' + s.totalAnswers + ' answers)').join(', ')}`);
console.log(`Seeds per (user,picker): ${NUM_SEEDS}`);
console.log('');

// Print summary table for both scenarios
for (const scenario of SCENARIOS) {
  const sc = aggregatedReport.scenarios[scenario.name];
  console.log(`=== ${scenario.name} (${scenario.questionsPerConcept}/concept = ${sc.totalQuestions} total, ${scenario.totalAnswers} answers) — mean +/- sd, ${NUM_SEEDS} seeds ===`);
  console.log('');
  for (const [key, agg] of Object.entries(sc.results)) {
    console.log(`${key}:`);
    console.log(`  maxStreak: ${agg.maxStreak.mean} +/- ${agg.maxStreak.sd}`);
    console.log(`  repeats: ${agg.repeats.mean} +/- ${agg.repeats.sd}, minGap: ${agg.minGap ? agg.minGap.mean + ' +/- ' + agg.minGap.sd : 'n/a'}`);
    console.log(`  wrongResurfaced: ${agg.wrongResurfacedCount.mean} +/- ${agg.wrongResurfacedCount.sd} (avgGap: ${agg.wrongResurfacedAvgGap ? agg.wrongResurfacedAvgGap.mean + ' +/- ' + agg.wrongResurfacedAvgGap.sd : 'n/a'})`);
    console.log(`  accuracyByWindow: ${JSON.stringify(Object.fromEntries(Object.entries(agg.accuracyByWindow).map(([k, v]) => [k, v.mean + ' +/- ' + v.sd])))}`);
    console.log(`  accuracyByDifficulty: ${JSON.stringify(Object.fromEntries(Object.entries(agg.accuracyByDifficulty).map(([k, v]) => [k, v.mean + ' +/- ' + v.sd])))}`);
    console.log(`  finalMeanKnowledge: ${agg.finalMeanKnowledge.mean} +/- ${agg.finalMeanKnowledge.sd}`);
    console.log(`  knowledgeGain: ${JSON.stringify(Object.fromEntries(Object.entries(agg.finalKnowledgeGain).map(([k, v]) => [k, v.mean + ' +/- ' + v.sd])))}`);
    console.log(`  shareByWindow: ${JSON.stringify(Object.fromEntries(Object.entries(agg.shareByWindowPerConcept).map(([wn, m]) => [wn, JSON.stringify(m)])))}`);
    console.log(`  avgTime: ${agg.avgTime.mean} +/- ${agg.avgTime.sd} ms`);
    console.log('');
  }
}

// Answer the key question: is random baseline final knowledge clearly below 1.0?
console.log('=== RANDOM BASELINE FINAL MEAN KNOWLEDGE (should be < 1.0) ===');
for (const scenario of SCENARIOS) {
  const sc = aggregatedReport.scenarios[scenario.name];
  for (const [key, agg] of Object.entries(sc.results)) {
    if (key.endsWith('|random')) {
      console.log(`${scenario.name} ${key}: finalMeanKnowledge = ${agg.finalMeanKnowledge.mean} +/- ${agg.finalMeanKnowledge.sd}`);
    }
  }
}
