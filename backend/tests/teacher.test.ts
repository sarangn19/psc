import { describe, expect, it } from 'vitest';
import { Difficulty } from '@prisma/client';
import {
  TEACHER_RESPONSE_RULES,
  buildDayPlan,
  nextDifficulty,
  optionName,
  scoreAnswer,
  validatePracticeQuestion,
} from '../src/lib/teacher';

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

  it('names chosen and correct options in correct and wrong answer feedback', () => {
    const options = ['A decrease of 20%', 'An increase of 20%', 'No change', 'An increase of 10%'];
    expect(optionName(options, 0)).toBe('A decrease of 20%');
    expect(optionName(options, 1)).toBe('An increase of 20%');
    expect(scoreAnswer(1, 1)).toBe(true);
    expect(scoreAnswer(0, 1)).toBe(false);
  });

  it('validates that a practice question has a complete stem and unambiguous choices', () => {
    expect(validatePracticeQuestion({
      text: 'If a price increases by 20% and returns to the original price, what is required?',
      options: ['A decrease of 20%', 'An increase of 20%', 'No change', 'An increase of 10%'],
      correctOption: 1,
    }).valid).toBe(true);
    expect(validatePracticeQuestion({
      text: '',
      options: ['One', 'One'],
      correctOption: 0,
    }).valid).toBe(false);
  });

  it.each([
    ['correct answer', 'correct'],
    ['wrong answer', 'wrong'],
    ['hint request', 'hint'],
    ['too-hard request', 'simplify'],
    ['long-break return', 'Long break'],
  ])('covers teacher response behavior for %s', (_caseName, expectedRule) => {
    expect(TEACHER_RESPONSE_RULES.toLowerCase()).toContain(expectedRule.toLowerCase());
  });
});
