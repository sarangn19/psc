// pickers.mjs — question pickers for the backend/sim simulation
//   - adaptivePick : current picker (adaptive.ts logic) + A3-4 repeat fallback
//   - randomPick   : random baseline + A3-4 repeat fallback
//   - createPickerV2(options): STEP B picker (pool-based, streak cap, cold
//                       start, smoothed mastery, spaced review, difficulty
//                       targeting). options select the variant:
//                         pickerV2a = createPickerV2()
//                                   (60/25/15 quotas, target accuracy 0.65)
//                         pickerV2b = createPickerV2({
//                           targetAccuracy: 0.70, earlyAnswers: 50,
//                           earlyTargets: { weak: 0.45, review: 0.20,
//                                           exploration: 0.35 } })
//                                   (B2: 45/20/35 for the first 50 answers,
//                                   then 60/25/15; target accuracy 0.70;
//                                   streak cap, cold start, mastery estimate
//                                   and spaced-review rules unchanged)
// Does NOT touch adaptive.ts.

import { CONCEPT_IDS, DIFFICULTY_ADJUSTMENT } from './engine.mjs';

export const DIFFICULTY_ORDER = { EASY: 0, MEDIUM: 1, HARD: 2 };

// ============================================================
// CURRENT PICKER (same ranking as adaptive.ts) + A3-4 repeats
// Ranking: non-mastered first, then lower accuracy, then fewer total
// answers, then lower conceptId. Within a concept: easiest unseen first.
// A3-4: when the chosen concept has no unseen questions left, re-serve
// the least recently seen question of that concept.
// ============================================================
export function adaptivePick(bank, seenIds, statsMap, rng, ctx) {
  const groups = new Map();
  for (const q of bank) {
    let g = groups.get(q.conceptId);
    if (!g) { g = { all: [], unseen: [] }; groups.set(q.conceptId, g); }
    g.all.push(q);
    if (!seenIds.has(q.id)) g.unseen.push(q);
  }
  const ranked = [...groups.entries()].map(([cid, g]) => {
    const s = statsMap.get(`concept:${cid}`) || { total: 0, correct: 0 };
    const accuracy = s.total > 0 ? s.correct / s.total : 0;
    g.unseen.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
    return {
      cid, all: g.all, unseen: g.unseen, accuracy, total: s.total,
      mastery: s.total >= 5 && accuracy >= 0.8,
    };
  }).sort((a, b) => {
    if (a.mastery !== b.mastery) return Number(a.mastery) - Number(b.mastery);
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    if (a.total !== b.total) return a.total - b.total;
    return a.cid - b.cid;
  });

  for (const g of ranked) {
    if (g.unseen.length > 0) return g.unseen[0];
    // A3-4: concept exhausted -> re-serve its least recently seen question
    let lru = null, lruOrder = -1;
    for (const q of g.all) {
      const o = ctx.questionLastSeen.get(q.id);
      if (o !== undefined && (lru === null || o < lruOrder)) { lruOrder = o; lru = q; }
    }
    if (lru) return lru;
  }
  return null;
}

// ============================================================
// RANDOM PICKER (uniform over unseen) + A3-4 repeat fallback
// ============================================================
export function randomPick(bank, seenIds, statsMap, rng, ctx) {
  const unseen = [];
  for (const q of bank) if (!seenIds.has(q.id)) unseen.push(q);
  if (unseen.length > 0) return unseen[Math.floor(rng() * unseen.length)];
  // A3-4: whole bank exhausted -> re-serve the global least recently seen question
  let lru = null, lruOrder = -1;
  for (const q of bank) {
    const o = ctx.questionLastSeen.get(q.id);
    if (o !== undefined && (lru === null || o < lruOrder)) { lruOrder = o; lru = q; }
  }
  return lru;
}

// ============================================================
// STEP B — pickerV2
//
// Smoothed mastery estimate (exact formula), per concept:
//   Process its answers a_1..a_n in order, maintaining:
//     Wc = Wc * LAMBDA + [a_i correct]      (LAMBDA = 0.9)
//     Wt = Wt * LAMBDA + 1
//   mastery(c) = (Wc + PRIOR_A) / (Wt + PRIOR_A + PRIOR_B)
//   with PRIOR_A = PRIOR_B = 1  (neutral uniform Beta(1,1) prior, mean 0.5)
//   => newest answer has weight 1, each older answer 0.9x the newer one;
//      the effective sample size converges to 1/(1-0.9) = 10 answers,
//      so the prior never outweighs the recent-answer evidence.
//
// Pools (after cold start):
//   weak        : mastery < 0.60        target share ~60% of picks
//   review      : mastery >= 0.75       target share ~25% of picks
//   exploration : 0.60 <= mastery < 0.75 target share ~15% of picks
//   Pool choice: largest deficit (target share - actual share), where the
//   actual share is measured over a discounted recent window (~100 picks,
//   QUOTA_DISCOUNT=0.99) so pools that activate late catch up quickly.
//   Cold-start warmup picks are not counted against the quota.
//
// Cold start: round-robin over concepts with < 3 answers (fewest answers
// first) — no weakness ranking until every concept has 3 questions.
//
// Streak cap: the last concept is blocked once the current run of
// consecutive questions from it reaches 3 => never more than 3 in a row.
//
// Within a chosen concept (in priority order):
//   1. Re-ask a missed question whose re-ask gap has elapsed:
//      on a miss, dueAt = order + U(8..15); if the re-ask is answered
//      correctly the gap doubles for the next miss (cap 60); a wrong
//      answer resets the gap to U(8..15).
//   2. Otherwise an unseen question, preferring the difficulty whose
//      P(correct) is closest to 65%: difficulty d minimizing
//      |mastery + adj(d) - 0.65| (ties: MEDIUM > EASY > HARD).
//   3. Otherwise (concept exhausted) the least recently seen question,
//      skipping the concept's most recently served question when this
//      is a spaced review (different-question rule).
//
// Concept-level spaced review: a concept is due when
//   answeredCount - lastPractice(c) >= reviewGap(c),  reviewGap starts at 8.
//   Correct spaced review: reviewGap doubles (cap 32).
//   Wrong spaced review:   reviewGap resets to 8.
// ============================================================
const LAMBDA = 0.9;
const PRIOR_A = 1;
const PRIOR_B = 1;
const QUOTA_DISCOUNT = 0.99; // pool-quota window: effective ~100 recent picks
const WEAK_THRESHOLD = 0.60;
const REVIEW_THRESHOLD = 0.75;
const POOL_TARGETS = { weak: 0.60, review: 0.25, exploration: 0.15 };
const COLD_START_PER_CONCEPT = 3;
const STREAK_CAP = 3;
const TARGET_ACCURACY = 0.65;
const MISS_REASK_MIN = 8;
const MISS_REASK_MAX = 15;
const MISS_REASK_GAP_CAP = 60;
const REVIEW_GAP_START = 8;
const REVIEW_GAP_MAX = 32;

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Pure: difficulty whose adjusted P(correct) is closest to the target.
export function targetDifficulty(mastery, target = TARGET_ACCURACY) {
  const options = [
    { d: 'MEDIUM', p: mastery + DIFFICULTY_ADJUSTMENT.MEDIUM },
    { d: 'EASY', p: mastery + DIFFICULTY_ADJUSTMENT.EASY },
    { d: 'HARD', p: mastery + DIFFICULTY_ADJUSTMENT.HARD },
  ];
  options.sort((a, b) => Math.abs(a.p - target) - Math.abs(b.p - target));
  return options[0].d;
}

// Pure: exponential-weight mastery update.
export function smoothedMasteryUpdate(wc, wt, correct) {
  const nwc = wc * LAMBDA + (correct ? 1 : 0);
  const nwt = wt * LAMBDA + 1;
  return { wc: nwc, wt: nwt, mastery: (nwc + PRIOR_A) / (nwt + PRIOR_A + PRIOR_B) };
}

// pickerV2a = createPickerV2()
//   -> quotas 60/25/15, difficulty target accuracy 0.65
// pickerV2b = createPickerV2({ targetAccuracy: 0.70, earlyAnswers: 50,
//   earlyTargets: { weak: 0.45, review: 0.20, exploration: 0.35 } })
//   -> STEP B2 tuning: for the first 50 answers quotas 45/20/35,
//      then switch to 60/25/15; difficulty target accuracy 0.70.
//   Streak cap, cold start, mastery estimate and spaced-review
//   rules are identical to pickerV2a.
export function createPickerV2(options = {}) {
  const {
    targetAccuracy = TARGET_ACCURACY,
    earlyAnswers = 0,
    earlyTargets = null,
  } = options;
  const cfg = {
    targetAccuracy,
    earlyAnswers,
    earlyTargets,
    mainTargets: POOL_TARGETS,
  };
  const state = {
    initialized: false,
    processedCount: 0,
    perConcept: new Map(),  // cid -> {count, wc, wt, mastery, lastPractice, reviewGap, lastServedQid}
    perQuestion: new Map(), // qid -> {ref, conceptId, difficulty, lastOrder, wrongLast, baseGap, currentGap, dueAt, reaskCount}
    poolCounts: { weak: 0, review: 0, exploration: 0 },
    poolWeights: { weak: 0, review: 0, exploration: 0 },
    poolEverNonEmpty: { weak: false, review: false, exploration: false },
    poolPicks: [],
    reaskEvents: [],        // {qid, gap, scheduled, correct, firstReask}
    pending: null,          // {cid, pool, wasDue} — consumed by the next synced answer
  };
  return {
    pick(bank, seenIds, statsMap, rng, ctx) { return v2Pick(state, bank, seenIds, rng, ctx, cfg); },
    getState() { return state; },
  };
}

function v2Pick(state, bank, seenIds, rng, ctx, cfg) {
  if (!state.initialized) {
    for (const cid of CONCEPT_IDS) {
      state.perConcept.set(cid, {
        count: 0, wc: 0, wt: 0, mastery: (PRIOR_A / (PRIOR_A + PRIOR_B)),
        lastPractice: null, reviewGap: REVIEW_GAP_START, lastServedQid: null,
      });
    }
    for (const q of bank) {
      state.perQuestion.set(q.id, {
        ref: q, conceptId: q.conceptId, difficulty: q.difficulty,
        lastOrder: null, wrongLast: false, baseGap: null, currentGap: null, dueAt: null, reaskCount: 0,
      });
    }
    state.initialized = true;
  }
  syncFromHistory(state, ctx);

  const { answeredCount, currentStreak, lastConcept } = ctx;

  // 1) COLD START: >= 3 questions per concept before any weakness ranking
  const cold = CONCEPT_IDS
    .filter(cid => state.perConcept.get(cid).count < COLD_START_PER_CONCEPT)
    .sort((a, b) => state.perConcept.get(a).count - state.perConcept.get(b).count || a - b);
  if (cold.length > 0) {
    // cold-start warmup: not counted against the pool quota (pre-ranking)
    return serveConcept(state, cold[0], 'exploration', ctx, false, cfg);
  }

  // 2) POOL selection: largest deficit vs the quota targets,
  //    measured over a discounted recent window (~100 picks) so that
  //    pools which activate late (concepts crossing a mastery threshold)
  //    catch up quickly instead of being locked out by early history.
  //    B2: pickerV2b uses earlyTargets (45/20/35) for the first
  //    `earlyAnswers` answers, then the main 60/25/15 targets.
  const targets = (cfg.earlyTargets && ctx.answeredCount < cfg.earlyAnswers)
    ? cfg.earlyTargets
    : cfg.mainTargets;
  const totalW = state.poolWeights.weak + state.poolWeights.review + state.poolWeights.exploration;
  const deficit = p => targets[p] - (totalW > 0 ? state.poolWeights[p] / totalW : 0);
  const poolOrder = ['weak', 'review', 'exploration'].sort((a, b) => deficit(b) - deficit(a));

  const masteryOf = cid => state.perConcept.get(cid).mastery;
  const pools = {
    weak: CONCEPT_IDS.filter(cid => masteryOf(cid) < WEAK_THRESHOLD),
    review: CONCEPT_IDS.filter(cid => masteryOf(cid) >= REVIEW_THRESHOLD),
    exploration: CONCEPT_IDS.filter(cid => masteryOf(cid) >= WEAK_THRESHOLD && masteryOf(cid) < REVIEW_THRESHOLD),
  };
  if (pools.weak.length > 0) state.poolEverNonEmpty.weak = true;
  if (pools.review.length > 0) state.poolEverNonEmpty.review = true;
  if (pools.exploration.length > 0) state.poolEverNonEmpty.exploration = true;

  // 3) STREAK CAP: never more than 3 consecutive questions from one concept
  const blocked = currentStreak >= STREAK_CAP ? lastConcept : null;

  for (const pool of poolOrder) {
    let cands = pools[pool];
    if (blocked !== null) cands = cands.filter(cid => cid !== blocked);
    if (cands.length === 0) continue;
    let cid;
    if (pool === 'weak') {
      cid = cands.slice().sort((a, b) => masteryOf(a) - masteryOf(b) || a - b)[0]; // weakest first
    } else if (pool === 'review') {
      cid = cands.slice().sort((a, b) => overdueRatio(state, ctx, b) - overdueRatio(state, ctx, a))[0]; // most overdue
    } else {
      cid = cands[Math.floor(rng() * cands.length)]; // random exploration
    }
    return serveConcept(state, cid, pool, ctx, true, cfg);
  }
  // Fallback (all pools empty or blocked): any other concept
  const any = CONCEPT_IDS.filter(cid => cid !== blocked);
  return serveConcept(state, any.length > 0 ? any[0] : CONCEPT_IDS[0], 'exploration', ctx, true, cfg);
}

function overdueRatio(state, ctx, cid) {
  const cs = state.perConcept.get(cid);
  if (cs.lastPractice === null) return Infinity;
  return (ctx.answeredCount - cs.lastPractice) / cs.reviewGap;
}

function serveConcept(state, cid, pool, ctx, countQuota = true, cfg = null) {
  const cs = state.perConcept.get(cid);
  const wasDue = cs.lastPractice !== null && (ctx.answeredCount - cs.lastPractice) >= cs.reviewGap;
  if (countQuota) {
    state.poolCounts[pool]++;
    for (const p of ['weak', 'review', 'exploration']) state.poolWeights[p] *= QUOTA_DISCOUNT;
    state.poolWeights[pool] += 1;
  }
  state.poolPicks.push({ pool, cid, order: ctx.answeredCount + 1 });
  state.pending = { cid, pool, wasDue };
  return selectQuestion(state, cid, ctx, pool === 'review', cfg);
}

function selectQuestion(state, cid, ctx, isReview, cfg) {
  const cs = state.perConcept.get(cid);
  const seenIds = ctx.seenIds;
  const answeredCount = ctx.answeredCount;

  // (a) due missed question -> re-ask the most overdue one
  let best = null, bestDue = Infinity;
  for (const qs of state.perQuestion.values()) {
    if (qs.conceptId !== cid || !qs.wrongLast || qs.dueAt === null) continue;
    if (qs.dueAt <= answeredCount && qs.dueAt < bestDue) { bestDue = qs.dueAt; best = qs; }
  }
  if (best) return best.ref;

  // (b) unseen question, preferring the difficulty that targets the
  //     desired P(correct) (0.65 for v2a, 0.70 for v2b)
  const targetD = targetDifficulty(cs.mastery, cfg ? cfg.targetAccuracy : TARGET_ACCURACY);
  const matching = [], other = [];
  for (const qs of state.perQuestion.values()) {
    if (qs.conceptId !== cid || seenIds.has(qs.ref.id)) continue;
    (qs.difficulty === targetD ? matching : other).push(qs);
  }
  const pool = matching.length > 0 ? matching : other;
  if (pool.length > 0) return pool[Math.floor(ctx.rng() * pool.length)].ref;

  // (c) repeat fallback (A3-4): least recently seen question of the concept;
  //     a spaced review must use a DIFFERENT question than the last serve
  const seenQs = [];
  for (const qs of state.perQuestion.values()) {
    if (qs.conceptId !== cid || qs.lastOrder === null) continue;
    seenQs.push(qs);
  }
  seenQs.sort((a, b) => a.lastOrder - b.lastOrder);
  if (isReview && seenQs.length > 1 && seenQs[0].ref.id === cs.lastServedQid) return seenQs[1].ref;
  return seenQs.length > 0 ? seenQs[0].ref : null;
}

// Fold newly answered questions (from the engine's history) into v2 state.
function syncFromHistory(state, ctx) {
  while (state.processedCount < ctx.history.length) {
    const h = ctx.history[state.processedCount++];

    // concept-level smoothed mastery + spaced-review bookkeeping
    const cs = state.perConcept.get(h.conceptId);
    const upd = smoothedMasteryUpdate(cs.wc, cs.wt, h.correct);
    cs.wc = upd.wc; cs.wt = upd.wt; cs.mastery = upd.mastery;
    cs.count++;
    cs.lastPractice = h.order;
    cs.lastServedQid = h.questionId;

    // spaced-review gap transition (only for genuine due reviews)
    if (state.pending && state.pending.cid === h.conceptId) {
      if (state.pending.wasDue) {
        if (h.correct) cs.reviewGap = Math.min(REVIEW_GAP_MAX, cs.reviewGap * 2);
        else cs.reviewGap = REVIEW_GAP_START;
      }
      state.pending = null;
    }

    // question-level missed-question re-ask ladder:
    //   miss (first ever)  -> gap = U(8..15)
    //   re-ask CORRECT     -> gap doubles (cap 60) for the next miss
    //   re-ask WRONG       -> gap resets to U(8..15)
    //   fresh miss after a correct streak -> keep the accumulated (longer) gap
    const qs = state.perQuestion.get(h.questionId);
    const wasWrong = qs.wrongLast;
    if (h.correct) {
      if (wasWrong) {
        // re-ask answered correctly -> longer gap before the next re-ask
        state.reaskEvents.push({
          qid: h.questionId, gap: h.order - qs.lastOrder,
          scheduled: qs.dueAt - qs.lastOrder,
          correct: true, firstReask: qs.reaskCount === 0,
        });
        qs.currentGap = Math.min(MISS_REASK_GAP_CAP, qs.currentGap * 2);
        qs.reaskCount++;
      }
      qs.wrongLast = false;
    } else {
      if (wasWrong) {
        // re-ask failed -> back to the base 8-15 gap
        state.reaskEvents.push({
          qid: h.questionId, gap: h.order - qs.lastOrder,
          scheduled: qs.dueAt - qs.lastOrder,
          correct: false, firstReask: qs.reaskCount === 0,
        });
        qs.reaskCount++;
        qs.baseGap = randInt(ctx.rng, MISS_REASK_MIN, MISS_REASK_MAX);
        qs.currentGap = qs.baseGap;
      } else if (qs.baseGap === null) {
        // first-ever miss -> base gap
        qs.baseGap = randInt(ctx.rng, MISS_REASK_MIN, MISS_REASK_MAX);
        qs.currentGap = qs.baseGap;
      }
      // else: fresh miss after a successful re-ask -> keep the accumulated gap
      qs.wrongLast = true;
      qs.dueAt = h.order + qs.currentGap;
    }
    qs.lastOrder = h.order;
  }
}
