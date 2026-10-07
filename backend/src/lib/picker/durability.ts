// Durability (plan item 1): the answer evidence (attempt + stat) is
// persisted FIRST; picker state is best-effort afterwards with at most
// 3 CAS retries. A failed state write NEVER fails the answer — the route
// logs PICKER_STATE_WRITE_FAILED fire-and-forget.

import type { PickerConfig } from './config';
import { applyAnswer } from './transitions';
import type {
  AnswerEvent,
  ConceptKey,
  ConceptState,
  InFlightEntry,
  PickerState,
  QuestionState,
  QKey,
} from './types';

export const MAX_STATE_WRITE_ATTEMPTS = 3;

export interface PickerStateRecord {
  state: PickerState;
  /** optimistic-concurrency version (UserPickerState.stateVersion) */
  stateVersion: number;
}

export interface PickerStore {
  /** Current state + version, or null when the session has none yet. */
  read(sessionId: string): Promise<PickerStateRecord | null>;
  /**
   * CAS write: persists only if the stored version still equals
   * `expectedVersion`. Returns false on version conflict.
   */
  write(
    sessionId: string,
    state: PickerState,
    expectedVersion: number
  ): Promise<boolean>;
}

export interface SubmitAnswerInput {
  sessionId: string;
  event: AnswerEvent;
  cfg: PickerConfig;
  store: PickerStore;
  /** Attempt + UserConceptStat write. Errors PROPAGATE (answer fails). */
  recordEvidence: (event: AnswerEvent) => Promise<void> | void;
  /** Creates the first state when store.read returns null (needs refs). */
  initState?: () => PickerState;
  /** Ladder miss-gap draws. Defaults to Math.random (prod). */
  rng?: () => number;
  /** Called once if state still cannot be written after all attempts. */
  onStateWriteFailed?: (error: unknown, attempts: number) => void;
}

export interface SubmitAnswerResult {
  /** evidence persisted — the user-visible answer is durable */
  ok: boolean;
  /** picker state folded in and written */
  stateWritten: boolean;
  attempts: number;
  stateError?: unknown;
}

export async function submitAnswerWithPickerState(
  input: SubmitAnswerInput
): Promise<SubmitAnswerResult> {
  const {
    sessionId,
    event,
    cfg,
    store,
    recordEvidence,
    initState,
    rng = Math.random,
    onStateWriteFailed,
  } = input;

  // 1) evidence FIRST — its failure fails the answer (no state touched)
  await recordEvidence(event);

  // 2) state best-effort, max 3 CAS attempts
  let attempts = 0;
  let lastError: unknown;
  while (attempts < MAX_STATE_WRITE_ATTEMPTS) {
    attempts += 1;
    try {
      const record = await store.read(sessionId);
      const state = record?.state ?? initState?.();
      if (!state) return { ok: true, stateWritten: false, attempts };

      applyAnswer(state, event, cfg, rng);
      const written = await store.write(
        sessionId,
        state,
        record ? record.stateVersion : 0
      );
      if (written) return { ok: true, stateWritten: true, attempts };

      lastError = new Error(
        `PICKER_STATE_WRITE_FAILED: CAS conflict (attempt ${attempts}/${MAX_STATE_WRITE_ATTEMPTS})`
      );
    } catch (err) {
      lastError = err;
    }
  }
  onStateWriteFailed?.(lastError, attempts);
  return { ok: true, stateWritten: false, attempts, stateError: lastError };
}

// ---------------------------------------------------------------
// JSON codec: UserPickerState.state is a JSON column; Maps are not
// JSON-safe. recentApplied is persisted with the state so the
// idempotency ring survives reloads.
// ---------------------------------------------------------------

export function serializeState(state: PickerState): unknown {
  return {
    picks: state.picks,
    answerCount: state.answerCount,
    concepts: state.concepts,
    conceptStates: [...state.conceptStates],
    questions: [...state.questions],
    inFlight: [...state.inFlight],
    poolWeights: state.poolWeights,
    poolCounts: state.poolCounts,
    warmupLeft: state.warmupLeft,
    warmupByGroup: state.warmupByGroup,
    weakByGroup: state.weakByGroup,
    recentApplied: state.recentApplied,
  };
}

export function deserializeState(raw: unknown): PickerState {
  const r = raw as Record<string, unknown>;
  const state: PickerState = {
    picks: r.picks as number,
    answerCount: r.answerCount as number,
    concepts: r.concepts as PickerState['concepts'],
    conceptStates: new Map(r.conceptStates as Array<[ConceptKey, ConceptState]>),
    questions: new Map(r.questions as Array<[QKey, QuestionState]>),
    byConcept: new Map(), // rebuilt by attachQuestions() on the next query
    inFlight: new Map(r.inFlight as Array<[QKey, InFlightEntry]>),
    poolWeights: r.poolWeights as PickerState['poolWeights'],
    poolCounts: r.poolCounts as PickerState['poolCounts'],
    warmupLeft: r.warmupLeft as number,
    warmupByGroup: r.warmupByGroup as PickerState['warmupByGroup'],
    weakByGroup: r.weakByGroup as PickerState['weakByGroup'],
    recentApplied: r.recentApplied as PickerState['recentApplied'],
  };
  return state;
}
