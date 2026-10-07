// State construction, lazy per-question creation, TTL pruning and caps.

import type { PickerConfig } from './config';
import { mastery } from './mastery';
import type {
  ConceptKey,
  ConceptState,
  PickerState,
  PoolName,
  QKey,
  QuestionRef,
} from './types';

export function initPickerState(
  questions: QuestionRef[],
  conceptKeys: ConceptKey[] | undefined,
  cfg: PickerConfig
): PickerState {
  const weights = { weak: 0, review: 0, exploration: 0 };
  const counts = { weak: 0, review: 0, exploration: 0 };
  const keys = conceptKeys ?? [...new Set(questions.map(q => q.conceptKey))];
  const conceptStates = new Map<ConceptKey, ConceptState>();
  for (const key of keys) {
    conceptStates.set(key, {
      count: 0,
      wc: 0,
      wt: 0,
      mastery: mastery(0, 0, cfg),
      lastPractice: null,
      reviewGap: cfg.reviewGapStart,
      lastServedQid: null,
    });
  }
  const byConcept = new Map<ConceptKey, QuestionRef[]>();
  for (const q of questions) {
    const list = byConcept.get(q.conceptKey);
    if (list) list.push(q);
    else byConcept.set(q.conceptKey, [q]);
  }
  return {
    picks: 0,
    answerCount: 0,
    concepts: keys,
    conceptStates,
    questions: new Map(),
    byConcept,
    inFlight: new Map(),
    poolWeights: weights,
    poolCounts: counts,
    warmupLeft: cfg.warmupMax,
    warmupByGroup: {},
    weakByGroup: {},
    recentApplied: [],
  };
}

/**
 * Rebuild byConcept after a state reload (deserialized state has none)
 * and create conceptStates for any concepts added since. Ordering = the
 * order of `questions` (the query's candidate rows).
 */
export function attachQuestions(
  state: PickerState,
  questions: QuestionRef[],
  cfg: PickerConfig
): void {
  state.byConcept = new Map();
  for (const q of questions) {
    const list = state.byConcept.get(q.conceptKey);
    if (list) list.push(q);
    else state.byConcept.set(q.conceptKey, [q]);
    if (!state.conceptStates.has(q.conceptKey)) {
      state.conceptStates.set(q.conceptKey, {
        count: 0,
        wc: 0,
        wt: 0,
        mastery: mastery(0, 0, cfg),
        lastPractice: null,
        reviewGap: cfg.reviewGapStart,
        lastServedQid: null,
      });
      state.concepts.push(q.conceptKey);
    }
  }
}

export function ensureQuestion(
  state: PickerState,
  ref: QuestionRef,
  cfg: PickerConfig
): void {
  const qid = ref.id;
  if (state.questions.has(qid)) return;
  state.questions.set(qid, {
    conceptKey: ref.conceptKey,
    difficulty: ref.difficulty,
    lastOrder: null,
    wrongLast: false,
    baseGap: null,
    currentGap: null,
    dueAt: null,
    reaskCount: 0,
  });
  capQuestionState(state, cfg);
}

/**
 * Cap perQuestion at cfg.maxQuestionState (plan §c). Evict settled
 * (wrongLast:false) entries first, then oldest lastOrder; never evict an
 * overdue or unanswered-wrong entry. An evicted entry loses its ladder
 * (lastOrder ≡ null → next miss restarts the gap).
 */
function capQuestionState(state: PickerState, cfg: PickerConfig): void {
  const max = cfg.maxQuestionState;
  if (!(state.questions.size > max)) return;
  const candidates = [...state.questions.entries()].filter(
    ([, qs]) => !qs.wrongLast && qs.dueAt === null
  );
  candidates.sort((a, b) => (a[1].lastOrder ?? -1) - (b[1].lastOrder ?? -1));
  for (const [key] of candidates) {
    if (state.questions.size <= max) break;
    state.questions.delete(key);
  }
}

/** Drop in-flight entries past TTL; enforce the inFlight cap. */
export function pruneInFlight(state: PickerState, cfg: PickerConfig, now: number): void {
  for (const [key, entry] of state.inFlight) {
    if (now - entry.at > cfg.inflightTtlMs) state.inFlight.delete(key);
  }
  if (state.inFlight.size <= cfg.maxInFlight) return;
  const entries = [...state.inFlight.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of entries) {
    if (state.inFlight.size <= cfg.maxInFlight) break;
    state.inFlight.delete(key);
  }
}

export function pushRecent(state: PickerState, qid: QKey): void {
  if (state.recentApplied.includes(qid)) return;
  state.recentApplied.push(qid);
  if (state.recentApplied.length > 20) state.recentApplied.shift();
}

export function alreadyApplied(state: PickerState, qid: QKey): boolean {
  return state.recentApplied.includes(qid);
}

export function bucketOf(m: number, cfg: PickerConfig): PoolName {
  if (m < cfg.weakThreshold) return 'weak';
  if (m >= cfg.reviewThreshold) return 'review';
  return 'exploration';
}
