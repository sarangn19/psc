import { describe, expect, it } from 'vitest';
import { scheduleRevision } from '../src/lib/revisionScheduler';

describe('revisionScheduler', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');

  it('schedules weak concepts for early review', () => {
    const result = scheduleRevision({
      conceptId: 1,
      mastery: 45,
      attemptCount: 5,
      lastResultCorrect: false,
      lastReviewedAt: now,
      lastIncorrectAt: now,
      repeatedMistakes: 1,
      consecutiveSuccesses: 0,
      existingIntervalDays: 7,
    }, now, 'medium');
    expect(result.priority).toBe('high');
    expect(result.intervalDays).toBe(1);
  });

  it('grows intervals only after confident successful recall', () => {
    const result = scheduleRevision({
      conceptId: 2,
      mastery: 90,
      lastResultCorrect: true,
      lastReviewedAt: now,
      lastIncorrectAt: null,
      repeatedMistakes: 0,
      consecutiveSuccesses: 3,
      existingIntervalDays: 5,
    }, now, 'high');
    expect(result.priority).toBe('low');
    expect(result.intervalDays).toBe(10);
  });

  it('renews attention after regression', () => {
    const result = scheduleRevision({
      conceptId: 3,
      mastery: 70,
      previousMastery: 90,
      attemptCount: 8,
      lastResultCorrect: false,
      lastReviewedAt: now,
      lastIncorrectAt: now,
      repeatedMistakes: 1,
      consecutiveSuccesses: 0,
      existingIntervalDays: 14,
    }, now, 'high');
    expect(result.priority).toBe('high');
    expect(result.intervalDays).toBe(1);
  });

  it('shortens a recurring repeated mistake and restores priority', () => {
    const result = scheduleRevision({
      conceptId: 5,
      mastery: 40,
      attemptCount: 6,
      lastResultCorrect: false,
      lastReviewedAt: now,
      lastIncorrectAt: now,
      repeatedMistakes: 3,
      consecutiveSuccesses: 0,
      existingIntervalDays: 14,
    }, now, 'medium');
    expect(result.priority).toBe('high');
    expect(result.intervalDays).toBe(1);
  });

  it('allows repeated history to expand after a confident correct review', () => {
    const result = scheduleRevision({
      conceptId: 6,
      mastery: 85,
      attemptCount: 8,
      previousMastery: 75,
      lastResultCorrect: true,
      lastReviewedAt: now,
      lastIncorrectAt: null,
      repeatedMistakes: 2,
      consecutiveSuccesses: 2,
      existingIntervalDays: 5,
    }, now, 'high');
    expect(result.priority).toBe('low');
    expect(result.intervalDays).toBe(10);
  });

  it('uses missing mastery as incomplete evidence, not poor performance', () => {
    const result = scheduleRevision({
      conceptId: 4,
      mastery: null,
      lastResultCorrect: true,
      lastReviewedAt: now,
      lastIncorrectAt: null,
      repeatedMistakes: 0,
      consecutiveSuccesses: 1,
      existingIntervalDays: null,
    }, now, 'low');
    expect(result.priority).toBe('medium');
    expect(result.intervalDays).toBe(1);
  });
});
