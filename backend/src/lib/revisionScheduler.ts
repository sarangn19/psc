export interface RevisionHistory {
  conceptId: number;
  mastery: number | null;
  previousMastery?: number | null;
  attemptCount?: number;
  lastResultCorrect: boolean | null;
  lastReviewedAt: Date | null;
  lastIncorrectAt: Date | null;
  repeatedMistakes: number;
  consecutiveSuccesses: number;
  existingIntervalDays: number | null;
}

export interface RevisionRecommendation {
  conceptId: number;
  priority: 'high' | 'medium' | 'low';
  dueAt: Date;
  intervalDays: number;
  reason: string;
}

export function scheduleRevision(input: RevisionHistory, now = new Date(), confidence = 'low' as 'high' | 'medium' | 'low'): RevisionRecommendation {
  const measuredAttempts = input.attemptCount ?? null;
  const weak = input.mastery !== null && input.mastery < 60 &&
    (measuredAttempts === null || measuredAttempts >= 3);
  const regression = input.lastResultCorrect === false &&
    input.previousMastery !== null &&
    input.previousMastery !== undefined &&
    input.previousMastery >= 80;
  const recurringFailure = input.lastResultCorrect === false && input.repeatedMistakes >= 2;
  let interval = input.existingIntervalDays || 1;
  let priority: RevisionRecommendation['priority'] = 'medium';
  let reason = 'Review to verify retained understanding.';

  if (weak || recurringFailure || regression) {
    priority = 'high';
    interval = 1;
    reason = regression ? 'Review now because previously understood material regressed.'
      : input.repeatedMistakes >= 2 ? 'Review soon because mistakes have recurred.'
      : 'Review soon because current mastery is weak.';
  } else if (input.lastResultCorrect === true && input.mastery !== null && input.mastery >= 80 && confidence !== 'low') {
    priority = 'low';
    interval = Math.min(30, Math.max(input.existingIntervalDays || 3, 3) * (confidence === 'high' ? 2 : 1));
    reason = 'Increase the review interval because successful recall supports stronger mastery.';
  }

  const dueAt = new Date(now.getTime() + interval * 86400000);
  return { conceptId: input.conceptId, priority, dueAt, intervalDays: interval, reason };
}
