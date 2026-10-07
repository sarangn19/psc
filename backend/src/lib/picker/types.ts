// Core types for the pure picker module.
// No Prisma, no vitest, no backend/sim imports — this module is transport-free.

/** Question identifier: sim uses numeric ids, the app uses cuid() strings. */
export type QKey = string | number;
/** Concept key: `concept:<id>` or `chapter:<id>` (see plan §7). */
export type ConceptKey = string;
/** Taxonomy group id (subject/topic) used for round-robin tie-breaking. */
export type GroupId = string;

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type PoolName = 'weak' | 'review' | 'exploration';
export type TieBreak = 'random' | 'keyOrder';

/** Injected random source in [0, 1). */
export type Rng = () => number;

/** Minimal question data the picker needs (candidate rows from a query). */
export interface QuestionRef {
  id: QKey;
  conceptKey: ConceptKey;
  difficulty: Difficulty;
}

/** Per-concept bookkeeping. */
export interface ConceptState {
  count: number;
  wc: number;
  wt: number;
  mastery: number;
  lastPractice: number | null;
  reviewGap: number;
  lastServedQid: QKey | null;
}

/** Per-question re-ask ladder state (created lazily, capped — plan §c). */
export interface QuestionState {
  conceptKey: ConceptKey;
  difficulty: Difficulty;
  lastOrder: number | null;
  wrongLast: boolean;
  baseGap: number | null;
  currentGap: number | null;
  dueAt: number | null;
  reaskCount: number;
}

/**
 * One served-but-unanswered question (plan §a). Keyed by question id.
 * Replaces the single `pending` slot: prefetch and late answers interact
 * per-question, never clobbering each other.
 */
export interface InFlightEntry {
  /** pick-time ordinal (monotone `picks` counter + 1) */
  order: number;
  conceptKey: ConceptKey;
  pool: PoolName;
  wasDue: boolean;
  /** epoch ms at pick time — entries expire after cfg.inflightTtlMs */
  at: number;
}

export interface PickerState {
  /** monotone pick counter; order assigned to a serve = ++picks */
  picks: number;
  /** number of answers folded into this state (the sim's `answeredCount`) */
  answerCount: number;
  concepts: ConceptKey[];
  conceptStates: Map<ConceptKey, ConceptState>;
  /** INSERTION-ORDER sensitive (sim iterates in bank order) — use Map */
  questions: Map<QKey, QuestionState>;
  /** bank-order question refs per concept (sim iterates perQuestion in
   *  bank order; state.questions is created lazily so ordering lives here) */
  byConcept: Map<ConceptKey, QuestionRef[]>;
  inFlight: Map<QKey, InFlightEntry>;
  poolWeights: Record<PoolName, number>;
  poolCounts: Record<PoolName, number>;
  /** cold-start budget (plan §b) */
  warmupLeft: number;
  warmupByGroup: Record<GroupId, number>;
  /** weak-pool round-robin counters (plan §2) */
  weakByGroup: Record<GroupId, number>;
  /** idempotency ring for answer application (cap 20) */
  recentApplied: QKey[];
}

/** What /next serves (phase-2 integration surface). */
export interface Serve {
  questionId: QKey;
  conceptKey: ConceptKey;
  pool: PoolName;
  /** = cfg.warmupLeft when this was a warmup pick, else null */
  warmup: number | null;
}

export interface PickInput {
  /** session-wide seen set (AdaptiveItem question ids, same key type) */
  seenIds: Set<QKey>;
  /** group per concept (subject/topic); undefined = groupless (parity) */
  groups?: Map<ConceptKey, GroupId>;
  /** session-aware current run of same-concept SERVED items */
  streak: number;
  /** concept key of the last served item of this run (null if none) */
  lastKey: ConceptKey | null;
  rng: Rng;
  /** epoch ms (routes pass Date.now(); tests pass fixed values) */
  now: number;
  /** focus sessions use the legacy picker (plan §d) — phase-2 gate */
  focused?: boolean;
}

/** One answered question, as folded into picker state. */
export interface AnswerEvent {
  questionId: QKey;
  conceptKey: ConceptKey;
  correct: boolean;
  /** engine ordinal; derived from in-flight entry when absent */
  order?: number;
  /** plan §d: focused answers update mastery + counters only */
  focused?: boolean;
  /** epoch ms; in-flight entries older than cfg.inflightTtlMs are treated
   *  as absent (plan item 1). Routes pass Date.now(); tests pass fixed. */
  now?: number;
}
