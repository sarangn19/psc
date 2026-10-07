// Shared fixtures for the picker test-suite (tests/ is outside tsc's
// include: ["src/**/*"], so vitest transpiles these without type-check).

import {
  applyAnswer,
  initPickerState,
  pickQuestion,
} from '../src/lib/picker';
import type {
  PickerConfig,
  PickerState,
  QKey,
  QuestionRef,
  Serve,
} from '../src/lib/picker';

/** Same generator as backend/sim/engine.mjs mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

export function makeRefs(
  concepts: Array<{ key: string; questions?: number }>,
  idPrefix = 'q'
): QuestionRef[] {
  const refs: QuestionRef[] = [];
  for (const c of concepts) {
    const n = c.questions ?? 3;
    for (let i = 0; i < n; i++) {
      refs.push({
        id: `${idPrefix}-${c.key}-${i}`,
        conceptKey: c.key,
        difficulty: DIFFICULTIES[i % 3],
      });
    }
  }
  return refs;
}

export interface DriveArgs {
  refs: QuestionRef[];
  cfg: PickerConfig;
  answers: number;
  conceptKeys?: string[];
  groups?: Map<string, string>;
  /** correctness per answer (default: all wrong) */
  correct?: (i: number, serve: Serve, state: PickerState) => boolean;
  seed?: number;
  now?: number;
  /** mutate freshly initialized state before the first pick */
  seedState?: (state: PickerState) => void;
}

export interface DriveResult {
  state: PickerState;
  serves: Serve[];
  seen: Set<QKey>;
}

/** Run pick→answer alternation (the sim's engine cadence). */
export function drive(args: DriveArgs): DriveResult {
  const cfg = args.cfg;
  const state = initPickerState(args.refs, args.conceptKeys, cfg);
  args.seedState?.(state);
  const rng = mulberry32(args.seed ?? 42);
  const seen = new Set<QKey>();
  const serves: Serve[] = [];
  const now = args.now ?? 0;
  let streak = 0;
  let lastKey: string | null = null;

  for (let i = 0; i < args.answers; i++) {
    const serve = pickQuestion(
      state,
      { seenIds: seen, groups: args.groups, streak, lastKey, rng, now },
      cfg
    );
    if (serve === null) break;
    serves.push(serve);
    seen.add(serve.questionId);
    streak = lastKey === serve.conceptKey ? streak + 1 : 1;
    lastKey = serve.conceptKey;
    const correct = args.correct?.(i, serve, state) ?? false;
    applyAnswer(
      state,
      { questionId: serve.questionId, conceptKey: serve.conceptKey, correct, now },
      cfg,
      rng
    );
  }
  return { state, serves, seen };
}
