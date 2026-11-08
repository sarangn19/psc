import { describe, it, expect } from 'vitest';
import { classifyMessageIntent } from '../src/lib/messageIntent';

describe('classifyMessageIntent', () => {
  it('classifies greeting', () => expect(classifyMessageIntent('hi')).toBe('GREETING'));
  it('classifies continue practice', () => expect(classifyMessageIntent('give me another question')).toBe('CONTINUE_PRACTICE'));

  // Ensure session-state and subject-request messages are not misclassified
  // at the messageIntent layer. Those intents are handled by classifyTeachingIntent
  // (responsePolicy); messageIntent is the simpler pre-classification layer.
  it('does not classify "which topic" as GREETING', () => {
    expect(classifyMessageIntent('Which topic are we on?')).not.toBe('GREETING');
  });
  it('"give me an English grammar question" is not misclassified as CONTINUE_PRACTICE', () => {
    expect(classifyMessageIntent('Give me an English grammar question')).not.toBe('CONTINUE_PRACTICE');
  });
});
