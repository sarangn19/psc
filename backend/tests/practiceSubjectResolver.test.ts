import { describe, it, expect } from 'vitest';
import { extractSubjectPhrase } from '../src/lib/practiceSubjectResolver';

// Unit tests for extractSubjectPhrase — pure function, no DB needed.
// Integration tests (resolveRequestedSubject against a real DB) would need a
// seeded test database; they are documented in the comments below.

describe('extractSubjectPhrase', () => {
  // ── Canonical subject-specific requests ───────────────────────────────────
  it('extracts "english grammar" from "Give me an English grammar question"', () => {
    expect(extractSubjectPhrase('Give me an English grammar question')).toBe('english grammar');
  });
  it('extracts "mathematics" from "Give me a mathematics question"', () => {
    expect(extractSubjectPhrase('Give me a mathematics question')).toBe('mathematics');
  });
  it('extracts "average" from "Give me an average question"', () => {
    expect(extractSubjectPhrase('Give me an average question')).toBe('average');
  });
  it('extracts "polity" from "I want a polity question"', () => {
    expect(extractSubjectPhrase('I want a polity question')).toBe('polity');
  });
  it('extracts "current affairs" from "Question on current affairs"', () => {
    expect(extractSubjectPhrase('Question on current affairs')).toBe('current affairs');
  });
  it('extracts subject from "Let me practice on English grammar"', () => {
    expect(extractSubjectPhrase("Let me practice on English grammar")).toBe('english grammar');
  });
  it('extracts subject from "quiz me on reasoning"', () => {
    expect(extractSubjectPhrase('quiz me on reasoning')).toBe('reasoning');
  });
  it('extracts subject from "give me a history question"', () => {
    expect(extractSubjectPhrase('give me a history question')).toBe('history');
  });
  it('extracts subject from "I want to practice general science"', () => {
    expect(extractSubjectPhrase('I want to practice general science')).toBe('general science');
  });

  // ── Generic requests — must return null ────────────────────────────────────
  it('returns null for "Give me a question"', () => {
    expect(extractSubjectPhrase('Give me a question')).toBeNull();
  });
  it('returns null for "another question"', () => {
    expect(extractSubjectPhrase('another question')).toBeNull();
  });
  it('returns null for "next question"', () => {
    expect(extractSubjectPhrase('next question')).toBeNull();
  });
  it('returns null for "give me a hard question"', () => {
    // "hard" is a difficulty adjective, not a subject
    expect(extractSubjectPhrase('give me a hard question')).toBeNull();
  });
  it('returns null for "give me an easy question"', () => {
    expect(extractSubjectPhrase('give me an easy question')).toBeNull();
  });
  it('returns null for generic "practice"', () => {
    expect(extractSubjectPhrase('practice')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(extractSubjectPhrase('')).toBeNull();
  });

  // ── Non-practice messages — must return null ──────────────────────────────
  it('returns null for "Explain Kerala"', () => {
    // Not a practice request at all — no "question/quiz/practice" signal.
    expect(extractSubjectPhrase('Explain Kerala')).toBeNull();
  });
  it('returns null for "Which topic are we on?"', () => {
    expect(extractSubjectPhrase('Which topic are we on?')).toBeNull();
  });
  it('returns null for "Change topic"', () => {
    expect(extractSubjectPhrase('Change topic')).toBeNull();
  });
  it('returns null for "hi"', () => {
    expect(extractSubjectPhrase('hi')).toBeNull();
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  it('extracts multi-word subject "banking awareness"', () => {
    expect(extractSubjectPhrase('give me a banking awareness question')).toBe('banking awareness');
  });
  it('strips trailing punctuation', () => {
    expect(extractSubjectPhrase('give me a maths question!')).toBe('maths');
  });
  it('is case-insensitive (returns lowercase)', () => {
    const phrase = extractSubjectPhrase('Give me an ENGLISH GRAMMAR question');
    expect(phrase).toBe('english grammar');
  });
});

/*
 * Integration tests (require a live DB with seeded data) — not run in CI.
 * Run manually with: npx vitest run tests/practiceSubjectResolver.integration.test.ts
 *
 * Test cases:
 * 1. "Give me an English grammar question"
 *    → resolveRequestedSubject returns type:'resolved', matchedName contains 'English'
 *    → findConstrainedQuestion returns a question where chapter.subject.name matches
 *    → question.chapter.subject.name !== 'Average' (no silent substitution)
 *
 * 2. "Give me a mathematics question"
 *    → resolveRequestedSubject returns type:'resolved'
 *    → selected question belongs to mathematics subject/chapter
 *
 * 3. "Give me an average question"
 *    → resolveRequestedSubject returns type:'resolved' (concept or chapter match)
 *
 * 4. "Give me a nonexistent xyz999 question"
 *    → resolveRequestedSubject returns type:'unresolved', phrase:'xyz999'
 *
 * 5. "Give me a question" (no subject)
 *    → resolveRequestedSubject returns type:'none' → falls through to adaptive
 */
