import { describe, expect, it } from 'vitest';
import {
  deriveStudentLearningProfile,
  ProfileAttemptInput,
} from '../src/lib/studentLearningProfile';

function attempt(overrides: Partial<ProfileAttemptInput> = {}): ProfileAttemptInput {
  return {
    questionId: 'q1',
    sessionId: 'session-1',
    selectedOption: 1,
    isCorrect: true,
    timeTaken: 12000,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    question: {
      conceptId: 101,
      chapterId: 'chapter-1',
      chapter: {
        id: 'chapter-1',
        name: 'Percentages',
        subject: { id: 'subject-1', name: 'Quantitative Aptitude' },
      },
      concept: { id: 101, nameEnglish: 'Percentage Change' },
    },
    ...overrides,
  };
}

describe('Student Learning Profile Phase 1', () => {
  it('distinguishes a new student from zero historical performance', () => {
    const profile = deriveStudentLearningProfile({
      attempts: [],
      conceptStats: [],
      nodeNames: new Map(),
      chapterNames: new Map(),
      sessions: [],
      selectedExamIds: ['exam-1'],
      unpractisedConceptIds: [101, 102],
      now: new Date('2026-11-06T10:00:00.000Z'),
    });

    expect(profile.academic.overall.accuracy).toBeNull();
    expect(profile.academic.overall.attempts).toBe(0);
    expect(profile.academic.unpractisedConceptIds).toEqual([101, 102]);
    expect(profile.behaviour.averageResponseTimeMs).toBeNull();
    expect(profile.behaviour.hintUsage).toEqual({
      dataAvailable: false,
      totalHints: null,
      hintDependency: null,
    });
    expect(profile.history.lastPracticeAt).toBeNull();
  });

  it('calculates historical and recent accuracy without fabricating missing values', () => {
    const historical = [
      attempt({ isCorrect: true }),
      attempt({ isCorrect: false, questionId: 'q2', timeTaken: 0 }),
      attempt({ isCorrect: true, questionId: 'q3' }),
    ];
    const profile = deriveStudentLearningProfile({
      attempts: historical,
      conceptStats: [{ conceptId: 101, chapterId: null, total: 3, correct: 2 }],
      nodeNames: new Map([[101, 'Percentage Change']]),
      chapterNames: new Map([[ 'chapter-1', 'Percentages']]),
      sessions: [],
      selectedExamIds: ['exam-1'],
      now: new Date('2026-11-06T10:00:00.000Z'),
    });

    expect(profile.academic.overall).toEqual({ attempts: 3, correct: 2, accuracy: 67 });
    expect(profile.academic.recent20).toEqual({ attempts: 3, correct: 2, accuracy: 67 });
    expect(profile.behaviour.responseTimeSampleSize).toBe(2);
    expect(profile.behaviour.averageResponseTimeMs).toBe(12000);
  });

  it('finds repeated mistakes and frequently selected incorrect options', () => {
    const wrongAttempts = [
      attempt({ questionId: 'q-repeat', isCorrect: false, selectedOption: 2 }),
      attempt({ questionId: 'q-repeat', isCorrect: false, selectedOption: 2 }),
      attempt({ questionId: 'q-other', isCorrect: false, selectedOption: 2 }),
    ];
    const profile = deriveStudentLearningProfile({
      attempts: wrongAttempts,
      conceptStats: [],
      nodeNames: new Map([[101, 'Percentage Change']]),
      chapterNames: new Map([[ 'chapter-1', 'Percentages']]),
      sessions: [],
      selectedExamIds: ['exam-1'],
      now: new Date('2026-11-06T10:00:00.000Z'),
    });

    expect(profile.behaviour.repeatedMistakes).toContainEqual({
      questionId: 'q-repeat',
      conceptId: 101,
      incorrectAttempts: 2,
    });
    expect(profile.behaviour.frequentlySelectedIncorrectOptions[0]).toEqual({
      conceptId: 101,
      selectedOption: 2,
      count: 3,
    });
  });

  it('uses actual session attempts and session timestamps across sessions', () => {
    const attempts = [
      attempt({ sessionId: 'old-session', createdAt: new Date('2026-10-30T10:00:00.000Z'), isCorrect: false }),
      attempt({ sessionId: 'current-session', createdAt: new Date('2026-11-06T09:50:00.000Z'), isCorrect: true }),
      attempt({ sessionId: 'current-session', createdAt: new Date('2026-11-06T09:55:00.000Z'), isCorrect: true }),
    ];
    const profile = deriveStudentLearningProfile({
      attempts,
      conceptStats: [],
      nodeNames: new Map([[101, 'Percentage Change']]),
      chapterNames: new Map([[ 'chapter-1', 'Percentages']]),
      sessions: [
        { id: 'current-session', startedAt: new Date('2026-11-06T09:45:00.000Z'), endedAt: null, totalQ: 2, correctQ: 2, focusConceptId: 101 },
        { id: 'old-session', startedAt: new Date('2026-10-30T09:45:00.000Z'), endedAt: new Date('2026-10-30T10:05:00.000Z'), totalQ: 1, correctQ: 0, focusConceptId: null },
      ],
      selectedExamIds: ['exam-1'],
      currentSessionId: 'current-session',
      now: new Date('2026-11-06T10:00:00.000Z'),
    });

    expect(profile.currentState.adaptiveSessionId).toBe('current-session');
    expect(profile.currentState.questionsCompleted).toBe(2);
    expect(profile.currentState.correctAnswers).toBe(2);
    expect(profile.currentState.sessionDurationMs).toBe(15 * 60 * 1000);
    expect(profile.currentState.recentAccuracy).toBe(100);
  });

  it('surfaces persisted feedback and due revisions in current teaching state', () => {
    const profile = deriveStudentLearningProfile({
      attempts: [],
      conceptStats: [],
      nodeNames: new Map([[101, 'Percentage Change']]),
      chapterNames: new Map(),
      sessions: [],
      selectedExamIds: ['exam-1'],
      now: new Date('2026-11-06T10:00:00.000Z'),
      learningFeedback: [
        { type: 'TOO_HARD', conceptId: 101, message: 'This is too difficult', createdAt: new Date('2026-11-06T09:55:00.000Z') },
        { type: 'NEED_BREAK', conceptId: 101, message: null, createdAt: new Date('2026-11-06T09:56:00.000Z') },
      ],
      revisionSchedule: [
        { conceptId: 101, masterySnapshot: 45, intervalDays: 1, dueAt: new Date('2026-11-05T10:00:00.000Z'), consecutiveSuccesses: 0, lastResultCorrect: false, lastReviewedAt: new Date('2026-11-04T10:00:00.000Z') },
      ],
    });

    expect(profile.currentState.studentReportedDifficulty).toBe('TOO_HARD');
    expect(profile.currentState.studentReportedFatigue).toBe('NEED_BREAK');
    expect(profile.history.conceptsRequiringRevision).toEqual([101]);
  });
});
