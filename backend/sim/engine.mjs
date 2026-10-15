// engine.mjs — shared simulation engine for backend/sim
//
// Learning model = A2 base + STEP A3 adjustments (exact formulas below).
// Re-implementation of adaptive.ts logic using fake in-memory data.
// Does NOT touch adaptive.ts and does NOT touch any database.

import { fileURLToPath } from 'url';
import { dirname } from 'path';

export const SIM_DIR = dirname(fileURLToPath(import.meta.url));

// ============================================================
// SEEDED RNG (mulberry32) - reproducible
// ============================================================
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// LEARNING MODEL
// Base (A2):
//   - On CORRECT: knowledge[X] += 0.006 * learnRate
//   - On WRONG:   knowledge[X] += 0.003 * learnRate  (explanation shown)
//   - learnRate: User A=1.0, B=0.0 (no learning), C=0.5 (slow), D=1.0
//   - Knowledge capped at 0.98
//   - P(correct) = clamp(conceptKnowledge + difficultyAdjustment, 0, 1)
//     EASY +0.10, MEDIUM +0.00, HARD -0.10
//   - Forgetting: every OTHER concept decays *0.9985 after each answer,
//     floored at the user's starting level (baseKnowledge)
// STEP A3 adjustments (exact formulas):
//   A3-1 Diminishing returns:
//        gain *= (1 - knowledge / 0.98)
//   A3-2 Spacing / massed-practice effect:
//        gain *= STREAK_FACTORS[min(n,4)-1], where n = number of
//        consecutive answers from the same concept INCLUDING this one
//        (n=1 -> 1.0, n=2 -> 0.8, n=3 -> 0.6, n>=4 -> 0.4)
//        gain *= 1.3 if the concept was last practiced 30+ answers
//        ago (or never practiced yet), else 1.0
//   A3-3 Frustration/boredom, checked after EVERY answer, exact formula:
//        pQuit = min(0.9,
//                0.08 * max(0, sameConceptStreak - 5)
//              + 0.12 * max(0, wrongRun - 3))
//        A quit ends the session; the next answer starts a new session
//        with fresh run state (sameConceptStreak=0, wrongRun=0,
//        lastConcept=null) until the total answer budget is spent.
//        Knowledge, seen questions and stats carry over across sessions.
//   A3-4 Repeats: when a concept has no unseen questions left, a picker
//        re-serves the least recently seen question of that concept.
//        (Random picker: uniform over unseen until the whole bank is
//        exhausted, then re-serves the global least recently seen question.)
// STEP A4:
//   A4-1 Churn (makes quitting costly): when a quit ends a session,
//        with probability 0.4 the user churns PERMANENTLY (no more
//        answers for the rest of the run); otherwise the user starts
//        a new session as before. Off by default (churnProb option),
//        so A3 runs stay reproducible; the A4/C2 runners opt in.
// ============================================================
export const LEARNING_RATE_CORRECT = 0.006;
export const LEARNING_RATE_WRONG = 0.003;
export const KNOWLEDGE_CAP = 0.98;
export const FORGETTING_FACTOR = 0.9985;
export const DIFFICULTY_ADJUSTMENT = { EASY: 0.10, MEDIUM: 0.00, HARD: -0.10 };

export const STREAK_FACTORS = [1.0, 0.8, 0.6, 0.4]; // A3-2
export const RECENCY_GAP = 30;                        // A3-2: answers since last practice
export const RECENCY_BONUS = 1.3;                     // A3-2: multiplier at/after the gap
export const QUIT_CAP = 0.9;                          // A3-3
export const QUIT_STREAK_COEF = 0.08;                 // A3-3
export const QUIT_STREAK_THRESHOLD = 5;               // A3-3
export const QUIT_WRONG_COEF = 0.12;                  // A3-3
export const QUIT_WRONG_THRESHOLD = 3;                // A3-3
export const QUIT_CHURN_PROB = 0.4;                   // A4-1: permanent churn on quit

// ============================================================
// CONCEPTS / USERS / QUESTION BANK
// ============================================================
export const CONCEPTS = [1, 2, 3, 4, 5, 6].map(id => ({ id, name: `Concept ${id}` }));
export const CONCEPT_IDS = CONCEPTS.map(c => c.id);

export const USERS = {
  A: { label: 'User A', baseKnowledge: new Map(CONCEPTS.map(c => [c.id, c.id <= 3 ? 0.85 : 0.30])), learnRate: 1.0 },
  B: { label: 'User B', baseKnowledge: new Map(CONCEPTS.map(c => [c.id, 0.25])), learnRate: 0.0 },
  C: { label: 'User C', baseKnowledge: new Map(CONCEPTS.map(c => [c.id, 0.30])), learnRate: 0.5 },
  D: { label: 'User D', baseKnowledge: new Map(CONCEPTS.map(c => [c.id, 0.55])), learnRate: 1.0 },
};

export function generateBank(questionsPerConcept) {
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
// SIMULATE ONE USER + ONE PICKER (A3 model)
// Picker interface: { pick(bank, seenIds, statsMap, rng, ctx), getState?() }
// ctx carries run state pickers may need (LRU maps, history, streak...).
// ============================================================
export function simulateUser(userConfig, picker, seed, questionBank, totalAnswers, options = {}) {
  const churnProb = options.churnProb ?? 0; // A4-1: 0 keeps A3 behavior
  const rng = mulberry32(seed);
  const knowledge = new Map(userConfig.baseKnowledge);
  const correctPerConcept = new Map(CONCEPTS.map(c => [c.id, 0]));
  const totalPerConcept = new Map(CONCEPTS.map(c => [c.id, 0]));
  const statsMap = new Map();
  const seenIds = new Set();
  const questionLastSeen = new Map();    // qid -> order (1-based)
  const conceptLastPractice = new Map(); // cid -> order (1-based)
  const history = [];
  const answerTimes = [];
  const sessionLengths = [];

  let answered = 0;
  let sessionLength = 0;
  let sessionIndex = 0;
  let sameConceptStreak = 0;
  let lastConcept = null;
  let wrongRun = 0;
  let quits = 0;      // A4-2: number of quit events
  let churned = false; // A4-1: did the user churn permanently?

  while (answered < totalAnswers) {
    const ctx = {
      bank: questionBank, seenIds, statsMap, rng,
      questionLastSeen, conceptLastPractice, history,
      answeredCount: answered, currentStreak: sameConceptStreak, lastConcept,
    };

    const t0 = process.hrtime.bigint();
    const q = picker.pick(questionBank, seenIds, statsMap, rng, ctx);
    const t1 = process.hrtime.bigint();
    answerTimes.push(Number(t1 - t0) / 1e6);

    if (!q) break;

    answered++;

    // A3-2 spacing factors, computed from state BEFORE this answer
    const streak = (q.conceptId === lastConcept) ? sameConceptStreak + 1 : 1;
    const streakFactor = STREAK_FACTORS[Math.min(streak, STREAK_FACTORS.length) - 1];
    const gap = conceptLastPractice.has(q.conceptId)
      ? answered - conceptLastPractice.get(q.conceptId)
      : Infinity;
    const recencyFactor = gap >= RECENCY_GAP ? RECENCY_BONUS : 1.0;

    seenIds.add(q.id);
    questionLastSeen.set(q.id, answered);
    conceptLastPractice.set(q.conceptId, answered);

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

    // Learning on the answered concept X (A3-1 diminishing returns + A3-2 spacing)
    if (userConfig.learnRate > 0) {
      const baseDelta = (correct ? LEARNING_RATE_CORRECT : LEARNING_RATE_WRONG) * userConfig.learnRate;
      const diminishing = 1 - conceptKnowledge / KNOWLEDGE_CAP;
      const delta = baseDelta * diminishing * streakFactor * recencyFactor;
      knowledge.set(q.conceptId, Math.min(KNOWLEDGE_CAP, conceptKnowledge + delta));
    }

    // Forgetting: every OTHER concept decays slightly, floored at starting level
    for (const c of CONCEPTS) {
      if (c.id === q.conceptId) continue;
      const base = userConfig.baseKnowledge.get(c.id);
      const current = knowledge.get(c.id) ?? base;
      knowledge.set(c.id, Math.max(base, current * FORGETTING_FACTOR));
    }

    history.push({ questionId: q.id, conceptId: q.conceptId, difficulty: q.difficulty, correct, order: answered, session: sessionIndex });

    // A3-3 frustration/boredom: update run state, then maybe quit the session
    if (q.conceptId === lastConcept) sameConceptStreak++;
    else { sameConceptStreak = 1; lastConcept = q.conceptId; }
    wrongRun = correct ? 0 : wrongRun + 1;
    sessionLength++;

    const pQuit = Math.min(QUIT_CAP,
      QUIT_STREAK_COEF * Math.max(0, sameConceptStreak - QUIT_STREAK_THRESHOLD) +
      QUIT_WRONG_COEF * Math.max(0, wrongRun - QUIT_WRONG_THRESHOLD));
    if (rng() < pQuit) {
      sessionLengths.push(sessionLength);
      quits++;
      sessionLength = 0;
      sameConceptStreak = 0;
      wrongRun = 0;
      lastConcept = null;
      sessionIndex++;
      // A4-1: quitting is costly — with probability churnProb the user
      // churns permanently and the run ends here.
      if (rng() < churnProb) { churned = true; break; }
    }
  }
  if (sessionLength > 0) sessionLengths.push(sessionLength);

  const pickerState = typeof picker.getState === 'function' ? picker.getState() : null;

  return {
    history, knowledge, correctPerConcept, totalPerConcept, statsMap,
    answerTimes, seenIds, sessionLengths, pickerState, quits, churned,
  };
}

// ============================================================
// METRICS
// ============================================================
export function computeMetrics(result, userConfig, label, pickerName, totalAnswers) {
  const { history, knowledge, correctPerConcept, totalPerConcept, answerTimes, sessionLengths, pickerState, quits, churned } = result;
  const total = history.length;

  // Windows: 1-50, 51-100, 101-200, 201-300
  // (for 1000-answer runs the last window covers 201-end, as in the A2 report)
  const windowDefs = [['1-50', 1, 50], ['51-100', 51, 100], ['101-200', 101, 200], ['201-300', 201, totalAnswers]];
  const windows = {};
  for (const [wn, ,] of windowDefs) windows[wn] = [];
  for (const h of history) {
    for (const [wn, lo, hi] of windowDefs) {
      if (h.order >= lo && h.order <= hi) { windows[wn].push(h); break; }
    }
  }

  // Share of questions per concept in windows
  const shareByWindow = {};
  for (const [wn, hs] of Object.entries(windows)) {
    const counts = new Map(CONCEPTS.map(c => [c.id, 0]));
    for (const h of hs) counts.set(h.conceptId, (counts.get(h.conceptId) || 0) + 1);
    shareByWindow[wn] = {};
    for (const [cid, cnt] of counts) shareByWindow[wn][cid] = hs.length > 0 ? +(cnt / hs.length).toFixed(3) : 0;
  }

  // Longest streak of consecutive questions from same concept.
  // Session-aware: a quit ends the session and the run state (including
  // the streak) resets, so the streak counter resets at session boundaries.
  let maxStreak = 0, curStreak = 0, lastConcept = null, lastSession = null;
  for (const h of history) {
    if (h.conceptId === lastConcept && h.session === lastSession) { curStreak++; }
    else { curStreak = 1; lastConcept = h.conceptId; lastSession = h.session; }
    if (curStreak > maxStreak) maxStreak = curStreak;
  }

  // Repeat count and min gap
  const questionSeenCount = new Map();
  const questionLastSeenOrder = new Map();
  let repeats = 0, minGap = Infinity;
  for (const h of history) {
    if (questionSeenCount.has(h.questionId)) {
      repeats++;
      const gap = h.order - questionLastSeenOrder.get(h.questionId);
      if (gap < minGap) minGap = gap;
    }
    questionSeenCount.set(h.questionId, (questionSeenCount.get(h.questionId) || 0) + 1);
    questionLastSeenOrder.set(h.questionId, h.order);
  }

  // Wrong answers that resurfaced later, and gap
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

  // Estimated mastery per concept (raw accuracy) vs TRUE knowledge at END
  const estimatedMastery = {};
  for (const c of CONCEPTS) {
    const tot = totalPerConcept.get(c.id) || 0;
    const cor = correctPerConcept.get(c.id) || 0;
    const est = tot > 0 ? cor / tot : 0;
    const trueKEnd = knowledge.get(c.id);
    estimatedMastery[c.id] = { estimated: +est.toFixed(3), trueEnd: +trueKEnd.toFixed(3), diff: +(est - trueKEnd).toFixed(3) };
  }

  // Overall accuracy per window + by difficulty
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

  // Share: exploration vs weak-focused vs review
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

  // Final true knowledge gain per concept (from base to end)
  const finalKnowledgeGain = {};
  for (const c of CONCEPTS) {
    const start = userConfig.baseKnowledge.get(c.id);
    const end = knowledge.get(c.id) ?? start;
    finalKnowledgeGain[c.id] = +(end - start).toFixed(4);
  }

  // Final mean knowledge across concepts (at END)
  const finalMeanKnowledge = mean(CONCEPTS.map(c => knowledge.get(c.id) ?? 0));

  // Sessions (A3-3)
  const sessions = sessionLengths.length;
  const avgSessionLength = sessions > 0 ? mean(sessionLengths) : 0;

  // Time per selection call (ms)
  const avgTime = answerTimes.length > 0 ? +(answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length).toFixed(4) : 0;
  const worstTime = answerTimes.length > 0 ? +Math.max(...answerTimes).toFixed(4) : 0;

  // Edge cases
  const allConceptsAnswered = CONCEPTS.every(c => (totalPerConcept.get(c.id) || 0) > 0);
  const conceptWithNoQuestions = CONCEPTS.filter(c => (totalPerConcept.get(c.id) || 0) === 0).map(c => c.id);

  // Cold-start: first 30 questions distribution across concepts
  const first30 = history.slice(0, 30);
  const coldStartDist = {};
  for (const c of CONCEPTS) {
    coldStartDist[c.id] = first30.filter(h => h.conceptId === c.id).length;
  }

  // pickerV2 diagnostics (only present when the picker exposes state)
  let v2 = null;
  if (pickerState) {
    const poolTotal = pickerState.poolCounts.weak + pickerState.poolCounts.review + pickerState.poolCounts.exploration;
    const firstReaskEvents = pickerState.reaskEvents.filter(e => e.firstReask);
    const firstReaskGaps = firstReaskEvents.map(e => e.gap);
    const firstReaskScheduled = firstReaskEvents.map(e => e.scheduled);
    v2 = {
      poolShares: {
        weak: poolTotal > 0 ? +(pickerState.poolCounts.weak / poolTotal).toFixed(3) : 0,
        review: poolTotal > 0 ? +(pickerState.poolCounts.review / poolTotal).toFixed(3) : 0,
        exploration: poolTotal > 0 ? +(pickerState.poolCounts.exploration / poolTotal).toFixed(3) : 0,
      },
      poolCounts: { ...pickerState.poolCounts },
      poolEverNonEmpty: { ...pickerState.poolEverNonEmpty },
      reaskFirstCount: firstReaskGaps.length,
      reaskFirstGapMean: firstReaskGaps.length > 0 ? +mean(firstReaskGaps).toFixed(3) : null,
      reaskFirstGapsRaw: firstReaskGaps,
      reaskFirstScheduledRaw: firstReaskScheduled,
    };
    // final smoothed mastery estimate per concept (pickerV2's own estimate)
    v2.finalSmoothedMastery = {};
    for (const c of CONCEPTS) {
      v2.finalSmoothedMastery[c.id] = +pickerState.perConcept.get(c.id).mastery.toFixed(4);
    }
  }

  return {
    label, pickerName, total,
    shareByWindow, maxStreak, repeats, minGap: minGap === Infinity ? null : minGap,
    wrongResurfacedCount: wrongResurfaced.length,
    wrongResurfacedAvgGap: wrongResurfaced.length > 0 ? +(wrongResurfaced.reduce((a, b) => a + b.gap, 0) / wrongResurfaced.length).toFixed(1) : null,
    estimatedMastery, accuracyByWindow, accuracyByDifficulty, shareBreakdown,
    finalKnowledgeGain, finalMeanKnowledge: +finalMeanKnowledge.toFixed(4),
    sessions, avgSessionLength: +avgSessionLength.toFixed(3),
    avgTime, worstTime, allConceptsAnswered, conceptWithNoQuestions,
    coldStartDist, v2,
    quits, churned,
  };
}

// ============================================================
// STATISTICS HELPERS
// ============================================================
export function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
export function sd(arr) {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
export function meanSd(arr) {
  return { mean: +mean(arr).toFixed(4), sd: +sd(arr).toFixed(4) };
}
export function ms(v) {
  return v === null || v === undefined ? 'n/a' : `${v.mean}±${v.sd}`;
}

// ============================================================
// AGGREGATE: mean +/- sd for every metric (over seeds)
// ============================================================
export function aggregateRunMetrics(runs) {
  const maxStreaks = runs.map(r => r.maxStreak);
  const repeatsArr = runs.map(r => r.repeats);
  const minGaps = runs.map(r => r.minGap).filter(x => x !== null);
  const wrongResurfacedCounts = runs.map(r => r.wrongResurfacedCount);
  const wrongResurfacedAvgGaps = runs.map(r => r.wrongResurfacedAvgGap).filter(x => x !== null);
  const avgTimes = runs.map(r => r.avgTime);
  const worstTimes = runs.map(r => r.worstTime);
  const finalMeanKnowledges = runs.map(r => r.finalMeanKnowledge);
  const sessionsArr = runs.map(r => r.sessions);
  const avgSessionLenArr = runs.map(r => r.avgSessionLength);
  const totalAnswersArr = runs.map(r => r.total);
  const quitsArr = runs.map(r => r.quits);
  const churnedShare = mean(runs.map(r => r.churned ? 1 : 0));

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

  // pickerV2 aggregates
  let v2 = null;
  if (runs[0].v2) {
    const allFirstGaps = [];
    const allFirstScheduled = [];
    for (const r of runs) {
      for (const g of r.v2.reaskFirstGapsRaw) allFirstGaps.push(g);
      for (const g of r.v2.reaskFirstScheduledRaw) allFirstScheduled.push(g);
    }
    const summarize = gaps => ({
      count: gaps.length,
      mean: gaps.length > 0 ? +mean(gaps).toFixed(4) : null,
      sd: gaps.length > 0 ? +sd(gaps).toFixed(4) : null,
      min: gaps.length > 0 ? Math.min(...gaps) : null,
      max: gaps.length > 0 ? Math.max(...gaps) : null,
      within815Share: gaps.length > 0
        ? +(gaps.filter(g => g >= 8 && g <= 15).length / gaps.length).toFixed(4)
        : null,
    });
    v2 = {
      poolShares: {
        weak: meanSd(runs.map(r => r.v2.poolShares.weak)),
        review: meanSd(runs.map(r => r.v2.poolShares.review)),
        exploration: meanSd(runs.map(r => r.v2.poolShares.exploration)),
      },
      reaskFirstGap: summarize(allFirstGaps),
      reaskFirstScheduled: summarize(allFirstScheduled),
      poolNonEmptyShare: {
        weak: meanSd(runs.map(r => r.v2.poolEverNonEmpty.weak ? 1 : 0)),
        review: meanSd(runs.map(r => r.v2.poolEverNonEmpty.review ? 1 : 0)),
        exploration: meanSd(runs.map(r => r.v2.poolEverNonEmpty.exploration ? 1 : 0)),
      },
      finalSmoothedMastery: {},
    };
    for (const c of CONCEPTS) {
      v2.finalSmoothedMastery[c.id] = meanSd(runs.map(r => r.v2.finalSmoothedMastery[c.id]));
    }
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
    sessions: meanSd(sessionsArr),
    avgSessionLength: meanSd(avgSessionLenArr),
    totalAnswers: meanSd(totalAnswersArr),
    quits: meanSd(quitsArr),
    churnedPct: +(churnedShare * 100).toFixed(1),
    total: mean(runs.map(r => r.total)),
    v2,
  };
}

export const SCENARIOS = [
  { name: 'LARGE', questionsPerConcept: 200, totalAnswers: 300 },
  { name: 'SMALL_BANK_LONG', questionsPerConcept: 40, totalAnswers: 1000 },
];
export const NUM_SEEDS = 20;
export const SEED_BASE = 12345;
