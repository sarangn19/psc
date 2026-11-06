import { describe, it, expect } from 'vitest';
import { upsertAnsweredQuestion } from '../src/lib/questionLifecycle';

describe('upsertAnsweredQuestion', () => {
  it('appends answered question once', () => {
    const q = { id: 'q1', text: 'What is 2+2?', options: ['3', '4', '5', '6'] };
    const result = upsertAnsweredQuestion([], q, 1, 1, true, 'Because 2+2=4.');
    expect(result).toHaveLength(1);
    expect(result[0].questionId).toBe('q1');
    expect(result[0].selectedOption).toBe(1);
  });

  it('updates existing instead of duplicating', () => {
    const q = { id: 'q1', text: 'What is 2+2?', options: ['3', '4', '5', '6'] };
    const first = upsertAnsweredQuestion([], q, 1, 1, true, 'exp');
    const second = upsertAnsweredQuestion(first, q, 2, 1, false, 'exp2');
    expect(second).toHaveLength(1);
    expect(second[0].selectedOption).toBe(2);
    expect(second[0].correct).toBe(false);
  });
});
