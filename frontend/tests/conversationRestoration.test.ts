import { describe, it, expect } from 'vitest';
import { normalizeRestoredChat } from '../src/lib/conversationRestoration';

describe('normalizeRestoredChat', () => {
  it('clears active question when already in history', () => {
    const stored = { messages: [{ kind: 'question', questionId: 'q1', text: 'Q' }], question: { id: 'q1' } };
    const result = normalizeRestoredChat(stored);
    expect(result.question).toBeNull();
  });

  it('keeps active question when not in history', () => {
    const stored = { messages: [], question: { id: 'q2' } };
    const result = normalizeRestoredChat(stored);
    expect(result.question?.id).toBe('q2');
  });
});
