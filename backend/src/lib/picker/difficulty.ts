// Difficulty targeting — exact port of sim pickers.mjs targetDifficulty():
// the difficulty whose adjusted P(correct) is closest to the target,
// options ordered MEDIUM, EASY, HARD; stable sort => ties MEDIUM > EASY > HARD.

import { DIFFICULTY_ADJUSTMENT, type PickerConfig } from './config';
import type { Difficulty } from './types';

export function targetDifficulty(mastery: number, cfg: PickerConfig): Difficulty {
  const options: Array<{ d: Difficulty; p: number }> = [
    { d: 'MEDIUM', p: mastery + DIFFICULTY_ADJUSTMENT.MEDIUM },
    { d: 'EASY', p: mastery + DIFFICULTY_ADJUSTMENT.EASY },
    { d: 'HARD', p: mastery + DIFFICULTY_ADJUSTMENT.HARD },
  ];
  options.sort((a, b) => Math.abs(a.p - cfg.targetAccuracy) - Math.abs(b.p - cfg.targetAccuracy));
  return options[0].d;
}
