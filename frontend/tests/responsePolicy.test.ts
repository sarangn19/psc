import { describe, it, expect } from 'vitest';
import { classifyTeachingIntent, determineResponseAction } from '../src/lib/responsePolicy';

describe('responsePolicy', () => {
  it('classifies greeting', () => expect(classifyTeachingIntent('hi')).toBe('GREETING'));
  it('maps greeting to conversational', () => expect(determineResponseAction('GREETING')).toBe('RESPOND_CONVERSATIONALLY'));
  it('maps quiz request to start practice', () => expect(determineResponseAction('QUIZ_REQUEST')).toBe('START_PRACTICE'));
});
