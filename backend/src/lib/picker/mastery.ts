// Mastery model — exact port of backend/sim/engine.mjs mastery():
//   m = (Wc + a) / (Wt + a + b), a = b = 1 (Laplace), lam = 0.9 decay.

import type { PickerConfig } from './config';

/** Smoothed mastery from cumulative weighted correct/total. */
export function mastery(wc: number, wt: number, cfg: PickerConfig): number {
  return (wc + cfg.priorA) / (wt + cfg.priorA + cfg.priorB);
}

/** Apply one answer to mastery counters and return the new smoothed value. */
export function applyMastery(
  wc: number,
  wt: number,
  correct: boolean,
  cfg: PickerConfig
): { wc: number; wt: number; mastery: number } {
  const nextWc = cfg.lambda * wc + (correct ? 1 : 0);
  const nextWt = cfg.lambda * wt + 1;
  return { wc: nextWc, wt: nextWt, mastery: mastery(nextWc, nextWt, cfg) };
}
