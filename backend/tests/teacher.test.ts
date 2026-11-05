import { describe, expect, it } from 'vitest';
import { Difficulty } from '@prisma/client';
import { buildDayPlan, nextDifficulty, scoreAnswer } from '../src/lib/teacher';

describe('AI Teacher progression helpers', () => {
  it('scores exact options deterministically', () => {
    expect(scoreAnswer(2, 2)).toBe(true);
    expect(scoreAnswer(1, 2)).toBe(false);
    expect(scoreAnswer(NaN, 2)).toBe(false);
  });

  it('adapts difficulty after wrong and right answers', () => {
    expect(nextDifficulty(Difficulty.MEDIUM, false)).toBe(Difficulty.EASY);
    expect(nextDifficulty(Difficulty.MEDIUM, true)).toBe(Difficulty.HARD);
    expect(nextDifficulty(Difficulty.HARD, false)).toBe(Difficulty.MEDIUM);
  });

  it('creates a bounded study plan with spaced review', () => {
    const target = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const plan = buildDayPlan([{ id: '1', name: 'Percentages' }], target, ['Ratio']);
    expect(plan).toHaveLength(7);
    expect(plan[3].type).toBe('review');
    expect(plan[3].title).toContain('Ratio');
  });
});
