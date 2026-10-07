// Picker configurations. V2B is the approved production config; PARITY
// reproduces backend/sim byte-for-byte (key-order tie-breaking, groupless,
// unbounded question state) and must ONLY be used by parity tests.

import type { PoolName, TieBreak } from './types';

export interface PickerConfig {
  targetAccuracy: number;
  earlyAnswers: number;
  earlyTargets: Record<PoolName, number> | null;
  mainTargets: Record<PoolName, number>;
  /** total warm-up budget (plan §b) */
  warmupMax: number;
  /** per-concept warm-up depth */
  warmupPerConcept: number;
  streakCap: number;
  tieBreak: TieBreak;
  /** cap on perQuestion entries (plan §c); Infinity only in parity */
  maxQuestionState: number;
  maxInFlight: number;
  inflightTtlMs: number;
  /** weak-tier width: mastery <= groupMin + tierEps (0 in keyOrder) */
  tierEps: number;
  lambda: number;
  priorA: number;
  priorB: number;
  quotaDiscount: number;
  weakThreshold: number;
  reviewThreshold: number;
  reaskMin: number;
  reaskMax: number;
  reaskGapCap: number;
  reviewGapStart: number;
  reviewGapMax: number;
}

/** STEP B2 tuning — pickerV2b (plan §2b/§2c approvals). */
export const V2B: PickerConfig = {
  targetAccuracy: 0.70,
  earlyAnswers: 50,
  earlyTargets: { weak: 0.45, review: 0.20, exploration: 0.35 },
  mainTargets: { weak: 0.60, review: 0.25, exploration: 0.15 },
  warmupMax: 20,
  warmupPerConcept: 3,
  streakCap: 3,
  tieBreak: 'random',
  maxQuestionState: 300,
  maxInFlight: 5,
  inflightTtlMs: 60 * 60 * 1000, // 1 hour (item 1)
  tierEps: 0.05,
  lambda: 0.9,
  priorA: 1,
  priorB: 1,
  quotaDiscount: 0.99,
  weakThreshold: 0.60,
  reviewThreshold: 0.75,
  reaskMin: 8,
  reaskMax: 15,
  reaskGapCap: 60,
  reviewGapStart: 8,
  reviewGapMax: 32,
};

/**
 * Parity-only config: tieBreak 'keyOrder' + tierEps 0 reproduce the sim's
 * sort-by-key behavior; maxQuestionState Infinity disables eviction so the
 * re-ask ladder is never truncated. Never use outside parity tests.
 */
export const PARITY: PickerConfig = {
  ...V2B,
  tieBreak: 'keyOrder',
  tierEps: 0,
  maxQuestionState: Number.POSITIVE_INFINITY,
};

export const DIFFICULTY_ADJUSTMENT: Record<'EASY' | 'MEDIUM' | 'HARD', number> = {
  EASY: 0.10,
  MEDIUM: 0.0,
  HARD: -0.10,
};

export const POOL_NAMES: PoolName[] = ['weak', 'review', 'exploration'];
