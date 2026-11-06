import { describe, it, expect } from 'vitest';
import { classifyMessageIntent } from '../src/lib/messageIntent';

describe('classifyMessageIntent', () => {
  it('classifies greeting', () => expect(classifyMessageIntent('hi')).toBe('GREETING'));
  it('classifies continue practice', () => expect(classifyMessageIntent('give me another question')).toBe('CONTINUE_PRACTICE'));
});
