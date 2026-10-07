// Pure picker module — STEP C/plan port of the validated pickerV2b.
// No Prisma, no vitest, no backend/sim imports (tests may import those).

export type {
  AnswerEvent,
  ConceptKey,
  ConceptState,
  Difficulty,
  GroupId,
  InFlightEntry,
  PickInput,
  PickerState,
  PoolName,
  QKey,
  QuestionRef,
  QuestionState,
  Rng,
  Serve,
  TieBreak,
} from './types';
export { PARITY, V2B, POOL_NAMES, DIFFICULTY_ADJUSTMENT } from './config';
export type { PickerConfig } from './config';
export { mastery, applyMastery } from './mastery';
export { targetDifficulty } from './difficulty';
export { compareKeys } from './compare';
export {
  attachQuestions,
  bucketOf,
  initPickerState,
  pruneInFlight,
} from './state';
export { applyAnswer } from './transitions';
export { pickQuestion } from './pick';
export {
  MAX_STATE_WRITE_ATTEMPTS,
  deserializeState,
  serializeState,
  submitAnswerWithPickerState,
} from './durability';
export type {
  PickerStateRecord,
  PickerStore,
  SubmitAnswerInput,
  SubmitAnswerResult,
} from './durability';
