import { describe, it, expect } from 'vitest';
import { classifyTeachingIntent, determineResponseAction, extractSubjectPhrase } from '../src/lib/responsePolicy';

describe('responsePolicy — existing intents', () => {
  it('classifies greeting', () => expect(classifyTeachingIntent('hi')).toBe('GREETING'));
  it('maps greeting to conversational', () => expect(determineResponseAction('GREETING')).toBe('RESPOND_CONVERSATIONALLY'));
  it('maps quiz request to start practice', () => expect(determineResponseAction('QUIZ_REQUEST')).toBe('START_PRACTICE'));
});

describe('responsePolicy — SESSION_STATE_INQUIRY', () => {
  it('classifies "Which topic question are we focusing now?"', () => {
    expect(classifyTeachingIntent('Which topic question are we focusing now?')).toBe('SESSION_STATE_INQUIRY');
  });
  it('classifies "What topic are we studying?"', () => {
    expect(classifyTeachingIntent('What topic are we studying?')).toBe('SESSION_STATE_INQUIRY');
  });
  it('classifies "Which question are we solving?"', () => {
    expect(classifyTeachingIntent('Which question are we solving?')).toBe('SESSION_STATE_INQUIRY');
  });
  it('classifies "What is the current topic?"', () => {
    expect(classifyTeachingIntent('What is the current topic?')).toBe('SESSION_STATE_INQUIRY');
  });
  it('classifies "What are we focusing on?"', () => {
    expect(classifyTeachingIntent('What are we focusing on?')).toBe('SESSION_STATE_INQUIRY');
  });
  it('maps SESSION_STATE_INQUIRY to REPORT_SESSION_STATE', () => {
    expect(determineResponseAction('SESSION_STATE_INQUIRY')).toBe('REPORT_SESSION_STATE');
  });
  it('does NOT misclassify "Explain Kerala" as SESSION_STATE_INQUIRY', () => {
    expect(classifyTeachingIntent('Explain Kerala')).not.toBe('SESSION_STATE_INQUIRY');
  });
  it('does NOT misclassify "hi" as SESSION_STATE_INQUIRY', () => {
    expect(classifyTeachingIntent('hi')).not.toBe('SESSION_STATE_INQUIRY');
  });
});

describe('responsePolicy — PRACTICE_SUBJECT_REQUEST', () => {
  it('classifies "Give me an English grammar question"', () => {
    expect(classifyTeachingIntent('Give me an English grammar question')).toBe('PRACTICE_SUBJECT_REQUEST');
  });
  it('classifies "Give me a mathematics question"', () => {
    expect(classifyTeachingIntent('Give me a mathematics question')).toBe('PRACTICE_SUBJECT_REQUEST');
  });
  it('classifies "Give me an average question"', () => {
    expect(classifyTeachingIntent('Give me an average question')).toBe('PRACTICE_SUBJECT_REQUEST');
  });
  it('classifies "Question on current affairs"', () => {
    expect(classifyTeachingIntent('Question on current affairs')).toBe('PRACTICE_SUBJECT_REQUEST');
  });
  it('classifies "I want a polity question"', () => {
    expect(classifyTeachingIntent('I want a polity question')).toBe('PRACTICE_SUBJECT_REQUEST');
  });
  it('maps PRACTICE_SUBJECT_REQUEST to START_PRACTICE_SUBJECT', () => {
    expect(determineResponseAction('PRACTICE_SUBJECT_REQUEST')).toBe('START_PRACTICE_SUBJECT');
  });
  it('does NOT classify generic "Give me a question" as PRACTICE_SUBJECT_REQUEST', () => {
    expect(classifyTeachingIntent('Give me a question')).not.toBe('PRACTICE_SUBJECT_REQUEST');
  });
  it('does NOT classify "another question" as PRACTICE_SUBJECT_REQUEST', () => {
    expect(classifyTeachingIntent('another question')).not.toBe('PRACTICE_SUBJECT_REQUEST');
  });
  it('does NOT classify "next question" as PRACTICE_SUBJECT_REQUEST', () => {
    expect(classifyTeachingIntent('next question')).not.toBe('PRACTICE_SUBJECT_REQUEST');
  });
});

describe('responsePolicy — CHANGE_TOPIC', () => {
  it('classifies "Change topic"', () => {
    expect(classifyTeachingIntent('Change topic')).toBe('CHANGE_TOPIC');
  });
  it('classifies "Switch to maths"', () => {
    expect(classifyTeachingIntent('Switch to maths')).toBe('CHANGE_TOPIC');
  });
  it('maps CHANGE_TOPIC to HANDLE_CHANGE_TOPIC', () => {
    expect(determineResponseAction('CHANGE_TOPIC')).toBe('HANDLE_CHANGE_TOPIC');
  });
});

describe('extractSubjectPhrase (frontend mirror)', () => {
  it('extracts "english grammar" from explicit request', () => {
    expect(extractSubjectPhrase('Give me an English grammar question')).toBe('english grammar');
  });
  it('extracts "average" from explicit request', () => {
    expect(extractSubjectPhrase('Give me an average question')).toBe('average');
  });
  it('extracts "mathematics" from explicit request', () => {
    expect(extractSubjectPhrase('Give me a mathematics question')).toBe('mathematics');
  });
  it('returns null for generic "Give me a question"', () => {
    expect(extractSubjectPhrase('Give me a question')).toBeNull();
  });
  it('returns null for non-practice messages', () => {
    expect(extractSubjectPhrase('Explain Kerala')).toBeNull();
    expect(extractSubjectPhrase('Which topic are we on?')).toBeNull();
    expect(extractSubjectPhrase('Change topic')).toBeNull();
  });
  it('returns null for plain "another question"', () => {
    expect(extractSubjectPhrase('another question')).toBeNull();
  });

  // Confirm "Average" does not bleed into English grammar request
  it('does not return "average" for an English grammar request', () => {
    expect(extractSubjectPhrase('Give me an English grammar question')).not.toBe('average');
  });
});

describe('no adaptive-subject contamination', () => {
  // Adaptive selection picks Average; but an explicit English grammar request
  // must result in PRACTICE_SUBJECT_REQUEST, not QUIZ_REQUEST.
  it('explicit subject overrides generic quiz intent', () => {
    const intent = classifyTeachingIntent('Give me an English grammar question');
    expect(intent).toBe('PRACTICE_SUBJECT_REQUEST');
    expect(intent).not.toBe('QUIZ_REQUEST');
  });

  // General academic context does not pollute practice selection.
  it('Explain Kerala stays non-practice intent after conversation context', () => {
    const intent = classifyTeachingIntent('Explain Kerala');
    expect(intent).not.toBe('PRACTICE_SUBJECT_REQUEST');
    expect(intent).not.toBe('SESSION_STATE_INQUIRY');
  });
});

describe('adaptive practice still works without explicit subject', () => {
  it('"give me another question" stays QUIZ_REQUEST', () => {
    expect(classifyTeachingIntent('give me another question')).toBe('QUIZ_REQUEST');
  });
  it('"practice" stays QUIZ_REQUEST', () => {
    expect(classifyTeachingIntent('practice')).toBe('QUIZ_REQUEST');
  });
  it('"next question" stays QUIZ_REQUEST', () => {
    expect(classifyTeachingIntent('next question')).toBe('QUIZ_REQUEST');
  });
});

describe('generic adaptive practice start (no subject)', () => {
  it('"start adaptive learning" → QUIZ_REQUEST', () => {
    expect(classifyTeachingIntent('start adaptive learning')).toBe('QUIZ_REQUEST');
  });
  it('"start practice" → QUIZ_REQUEST', () => {
    expect(classifyTeachingIntent('start practice')).toBe('QUIZ_REQUEST');
  });
  it('"begin adaptive session" → QUIZ_REQUEST', () => {
    expect(classifyTeachingIntent('begin adaptive session')).toBe('QUIZ_REQUEST');
  });
  it('"start adaptive learning" maps to START_PRACTICE', () => {
    expect(determineResponseAction('QUIZ_REQUEST')).toBe('START_PRACTICE');
  });
  // "give some question" has no real subject — extractSubjectPhrase should return null
  it('"give some question" extracts no subject phrase', () => {
    expect(extractSubjectPhrase('give some question')).toBeNull();
  });
});
