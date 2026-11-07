import { describe, it, expect } from 'vitest';
import { classifyIntent, composeConversationResponse } from '../src/lib/conversationIntent';

describe('conversationIntent', () => {
  it('classifies greeting', () => {
    expect(classifyIntent('hi')).toBe('GREETING');
  });

  it('composes greeting response', () => {
    expect(composeConversationResponse('GREETING', 'hi')).toContain('Good to see you');
  });

  it('composes explanation from stored explanation', () => {
    const response = composeConversationResponse('EXPLANATION_REQUEST', 'explain', 'What is 20% of 500?', '20% of 500 equals 100.');
    expect(response).toContain('20% of 500 equals 100.');
  });

  it('handles missing explanation honestly', () => {
    const response = composeConversationResponse('EXPLANATION_REQUEST', 'explain', 'Question', null);
    expect(response).toContain('stored question details');
  });
});
