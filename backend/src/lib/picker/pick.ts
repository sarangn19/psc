// The pick: cold start → pool quota → streak cap → pool selection →
// within-concept question selection. Exact port of sim pickers.mjs
// v2Pick/serveConcept/selectQuestion, plus the approved production
// extensions (group round-robin cold start, random tie-break, warmup
// budget, inFlight TTL/cap).

import type { PickerConfig } from './config';
import { compareKeys } from './compare';
import { targetDifficulty } from './difficulty';
import { POOL_NAMES } from './config';
import {
  ensureQuestion,
  pruneInFlight,
} from './state';
import type {
  ConceptKey,
  GroupId,
  PickInput,
  PickerState,
  PoolName,
  QuestionRef,
  Serve,
} from './types';

interface SeenQuestion {
  ref: QuestionRef;
  lastOrder: number;
}

export function pickQuestion(
  state: PickerState,
  input: PickInput,
  cfg: PickerConfig
): Serve | null {
  pruneInFlight(state, cfg, input.now);

  // (1) COLD START: >= warmupPerConcept answers per concept before any
  // weakness ranking. Budgeted (plan §b) and NOT counted against quota.
  const cold = state.concepts.filter(
    cid => (state.conceptStates.get(cid)?.count ?? 0) < cfg.warmupPerConcept
  );
  if (cold.length > 0 && state.warmupLeft > 0) {
    const cid = pickCold(state, cold, input, cfg);
    return serve(state, cid, 'exploration', false, false, input, cfg, true);
  }

  // (2) POOL quota: largest deficit vs targets over the discounted window
  const targets =
    cfg.earlyTargets && state.answerCount < cfg.earlyAnswers
      ? cfg.earlyTargets
      : cfg.mainTargets;
  const totalW =
    state.poolWeights.weak + state.poolWeights.review + state.poolWeights.exploration;
  const deficit = (p: PoolName) =>
    targets[p] - (totalW > 0 ? state.poolWeights[p] / totalW : 0);
  const poolOrder = [...POOL_NAMES].sort((a, b) => deficit(b) - deficit(a));

  const masteryOf = (cid: ConceptKey) => state.conceptStates.get(cid)!.mastery;
  const pools: Record<PoolName, ConceptKey[]> = {
    weak: state.concepts.filter(cid => masteryOf(cid) < cfg.weakThreshold),
    review: state.concepts.filter(cid => masteryOf(cid) >= cfg.reviewThreshold),
    exploration: state.concepts.filter(
      cid => masteryOf(cid) >= cfg.weakThreshold && masteryOf(cid) < cfg.reviewThreshold
    ),
  };

  // (3) STREAK CAP: block the last concept once the run reaches the cap
  const blocked =
    input.streak >= cfg.streakCap && input.lastKey !== null ? input.lastKey : null;

  for (const pool of poolOrder) {
    let cands = pools[pool];
    if (blocked !== null) cands = cands.filter(cid => cid !== blocked);
    if (cands.length === 0) continue;
    const cid = selectConcept(pool, cands, state, input, cfg);
    return serve(state, cid, pool, true, pool === 'review', input, cfg, false);
  }

  // Fallback (all pools empty or blocked)
  const any = state.concepts.filter(cid => cid !== blocked);
  const cid = any.length > 0
    ? any[0]
    : state.concepts.length > 0
      ? state.concepts[0]
      : null;
  if (cid === null) return null;
  return serve(state, cid, 'exploration', true, false, input, cfg, false);
}

function pickCold(
  state: PickerState,
  cold: ConceptKey[],
  input: PickInput,
  cfg: PickerConfig
): ConceptKey {
  if (!input.groups) {
    return chooseFewestAnswers(state, cold, input, cfg);
  }
  // round-robin across groups (plan §b), then within-group fewest answers
  const byGroup = new Map<GroupId, ConceptKey[]>();
  for (const cid of cold) {
    const g = input.groups.get(cid) ?? '';
    const list = byGroup.get(g);
    if (list) list.push(cid);
    else byGroup.set(g, [cid]);
  }
  const groupIds = [...byGroup.keys()];
  let minPicks = Number.POSITIVE_INFINITY;
  for (const g of groupIds) minPicks = Math.min(minPicks, state.warmupByGroup[g] ?? 0);
  const tied = groupIds.filter(g => (state.warmupByGroup[g] ?? 0) === minPicks);
  const g = pickTied(tied, input, cfg);
  const chosen = chooseFewestAnswers(state, byGroup.get(g)!, input, cfg);
  state.warmupByGroup[g] = minPicks + 1;
  return chosen;
}

function chooseFewestAnswers(
  state: PickerState,
  cands: ConceptKey[],
  input: PickInput,
  cfg: PickerConfig
): ConceptKey {
  const countOf = (cid: ConceptKey) => state.conceptStates.get(cid)!.count;
  let min = Number.POSITIVE_INFINITY;
  for (const cid of cands) min = Math.min(min, countOf(cid));
  const tied = cands.filter(cid => countOf(cid) === min);
  return pickTied(tied, input, cfg);
}

/** Random among ties (random mode) or smallest key (keyOrder). */
function pickTied(tied: ConceptKey[], input: PickInput, cfg: PickerConfig): ConceptKey {
  if (cfg.tieBreak === 'keyOrder') {
    return [...tied].sort((a, b) => compareKeys(a, b))[0];
  }
  return tied[Math.floor(input.rng() * tied.length)];
}

function selectConcept(
  pool: PoolName,
  cands: ConceptKey[],
  state: PickerState,
  input: PickInput,
  cfg: PickerConfig
): ConceptKey {
  const masteryOf = (cid: ConceptKey) => state.conceptStates.get(cid)!.mastery;

  if (pool === 'weak') {
    if (cfg.tieBreak === 'keyOrder') {
      // sim: sort by mastery asc, ties by numeric key asc (stable)
      return [...cands].sort((a, b) => masteryOf(a) - masteryOf(b) || compareKeys(a, b))[0];
    }
    // approved plan §2: group-level least-picked round-robin, then rng
    // among the weakest tier within the group
    if (input.groups) {
      const byGroup = new Map<GroupId, ConceptKey[]>();
      for (const cid of cands) {
        const g = input.groups.get(cid) ?? '';
        const list = byGroup.get(g);
        if (list) list.push(cid);
        else byGroup.set(g, [cid]);
      }
      let minPicks = Number.POSITIVE_INFINITY;
      for (const g of byGroup.keys())
        minPicks = Math.min(minPicks, state.weakByGroup[g] ?? 0);
      const tied = [...byGroup.keys()].filter(
        g => (state.weakByGroup[g] ?? 0) === minPicks
      );
      const g = pickTied(tied, input, cfg);
      const members = byGroup.get(g)!;
      const cid = weakestTier(members, masteryOf, input, cfg);
      state.weakByGroup[g] = minPicks + 1;
      return cid;
    }
    return weakestTier(cands, masteryOf, input, cfg);
  }

  if (pool === 'review') {
    const ratio = (cid: ConceptKey) => overdueRatio(state, cid, cfg);
    if (cfg.tieBreak === 'keyOrder') {
      // sim: sort by ratio desc (stable; NaN treated as 0 keeps order)
      return [...cands].sort((a, b) => {
        const d = ratio(b) - ratio(a);
        return Number.isNaN(d) ? 0 : d;
      })[0];
    }
    let max = -Number.POSITIVE_INFINITY;
    for (const cid of cands) max = Math.max(max, ratio(cid));
    const tied = cands.filter(cid => ratio(cid) === max);
    return pickTied(tied, input, cfg);
  }

  // exploration: rng in BOTH modes (sim draws here)
  return cands[Math.floor(input.rng() * cands.length)];
}

function weakestTier(
  members: ConceptKey[],
  masteryOf: (cid: ConceptKey) => number,
  input: PickInput,
  cfg: PickerConfig
): ConceptKey {
  let groupMin = Number.POSITIVE_INFINITY;
  for (const cid of members) groupMin = Math.min(groupMin, masteryOf(cid));
  const tier = members.filter(cid => masteryOf(cid) <= groupMin + cfg.tierEps);
  if (cfg.tieBreak === 'keyOrder') {
    return [...tier].sort((a, b) => masteryOf(a) - masteryOf(b) || compareKeys(a, b))[0];
  }
  return tier[Math.floor(input.rng() * tier.length)];
}

function overdueRatio(state: PickerState, cid: ConceptKey, cfg: PickerConfig): number {
  const cs = state.conceptStates.get(cid)!;
  if (cs.lastPractice === null) return Number.POSITIVE_INFINITY;
  return (state.answerCount - cs.lastPractice) / cs.reviewGap;
}

function serve(
  state: PickerState,
  cid: ConceptKey,
  pool: PoolName,
  countQuota: boolean,
  isReview: boolean,
  input: PickInput,
  cfg: PickerConfig,
  warmup: boolean
): Serve | null {
  const cs = state.conceptStates.get(cid)!;
  const wasDue =
    cs.lastPractice !== null && state.answerCount - cs.lastPractice >= cs.reviewGap;

  if (countQuota) {
    state.poolCounts[pool] += 1;
    for (const p of POOL_NAMES) state.poolWeights[p] *= cfg.quotaDiscount;
    state.poolWeights[pool] += 1;
  }

  const ref = selectQuestion(state, cid, isReview, input, cfg);
  if (ref === null) return null;
  ensureQuestion(state, ref, cfg);

  const order = ++state.picks;
  state.inFlight.set(ref.id, {
    order,
    conceptKey: cid,
    pool,
    wasDue,
    at: input.now,
  });
  // re-apply the cap AFTER insertion so the newest entry always survives
  pruneInFlight(state, cfg, input.now);

  if (warmup) state.warmupLeft -= 1;
  return {
    questionId: ref.id,
    conceptKey: cid,
    pool,
    warmup: warmup ? state.warmupLeft : null,
  };
}

function selectQuestion(
  state: PickerState,
  cid: ConceptKey,
  isReview: boolean,
  input: PickInput,
  cfg: PickerConfig
): QuestionRef | null {
  const cs = state.conceptStates.get(cid)!;
  const refs = state.byConcept.get(cid) ?? [];

  // (a) due missed question -> re-ask the most overdue one
  let best: QuestionRef | null = null;
  let bestDue = Number.POSITIVE_INFINITY;
  for (const ref of refs) {
    const qs = state.questions.get(ref.id);
    if (!qs || !qs.wrongLast || qs.dueAt === null) continue;
    if (qs.dueAt <= state.answerCount && qs.dueAt < bestDue) {
      bestDue = qs.dueAt;
      best = ref;
    }
  }
  if (best !== null) return best;

  // (b) unseen question, preferring the difficulty whose adjusted
  // P(correct) is closest to the target accuracy
  const targetD = targetDifficulty(cs.mastery, cfg);
  const matching: QuestionRef[] = [];
  const other: QuestionRef[] = [];
  for (const ref of refs) {
    if (input.seenIds.has(ref.id)) continue;
    (ref.difficulty === targetD ? matching : other).push(ref);
  }
  const unseen = matching.length > 0 ? matching : other;
  if (unseen.length > 0) return unseen[Math.floor(input.rng() * unseen.length)];

  // (c) repeat fallback: least recently seen question of the concept,
  // skipping the most recent serve for spaced reviews (different-question
  // rule). Evicted records (cap) count as lastOrder -1 (plan §c).
  const seenQs: SeenQuestion[] = [];
  for (const ref of refs) {
    if (!input.seenIds.has(ref.id)) continue; // never served -> not "seen"
    const qs = state.questions.get(ref.id);
    if (qs && qs.lastOrder === null) continue; // served, unanswered (in flight)
    seenQs.push({ ref, lastOrder: qs && qs.lastOrder !== null ? qs.lastOrder : -1 });
  }
  seenQs.sort((a, b) => a.lastOrder - b.lastOrder);
  if (
    isReview &&
    seenQs.length > 1 &&
    seenQs[0].ref.id === cs.lastServedQid
  ) {
    return seenQs[1].ref;
  }
  return seenQs.length > 0 ? seenQs[0].ref : null;
}
