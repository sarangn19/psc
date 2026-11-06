import { describe, expect, it } from 'vitest';
import { diagnoseStudent } from '../src/lib/diagnosticEngine';
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
    timeTaken: 10000,
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

function profile(attempts: ProfileAttemptInput[], sessions: Array<{
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  totalQ: number;
  correctQ: number;
  focusConceptId: number | null;
}> = [], persistentMemory?: Array<{ type: string; conceptId: number | null; key: string; details: unknown; occurredAt: Date }>) {
  return deriveStudentLearningProfile({
    attempts,
    conceptStats: [],
    nodeNames: new Map([[101, 'Percentage Change']]),
    chapterNames: new Map([['chapter-1', 'Percentages']]),
    sessions,
    selectedExamIds: ['exam-1'],
    now: new Date('2026-11-06T10:00:00.000Z'),
    persistentMemory,
  });
}

describe('Backend Diagnostic Engine Phase 2', () => {
  it('reports insufficient data for a new student without history', () => {
    const result = diagnoseStudent(profile([]));
    expect(result.overallStatus).toBe('insufficient_data');
    expect(result.weakConcepts).toEqual([]);
    expect(result.strongConcepts).toEqual([]);
    expect(result.evidence[0].message).toContain('No historical attempts');
    expect(result.recommendedTeachingInterventions[0].kind).toBe('verify_understanding');
  });

  it('detects repeated incorrect answers as a recurring concept difficulty', () => {
    const result = diagnoseStudent(profile([
      attempt({ questionId: 'q-repeat', isCorrect: false }),
      attempt({ questionId: 'q-repeat', isCorrect: false }),
      attempt({ questionId: 'q-repeat', isCorrect: false }),
    ]));
    expect(result.repeatedMistakes[0].incorrectAttempts).toBe(3);
    expect(result.weakConcepts.length).toBe(1);
    expect(result.emergingKnowledgeGaps.length).toBe(1);
    expect(result.recommendedTeachingInterventions.some((item) => item.kind === 'reteach_alternative')).toBe(true);
  });

  it('does not turn one isolated mistake into a knowledge gap', () => {
    const result = diagnoseStudent(profile([
      attempt({ isCorrect: true }),
      attempt({ isCorrect: true }),
      attempt({ questionId: 'q-mistake', isCorrect: false }),
      attempt({ isCorrect: true }),
      attempt({ isCorrect: true }),
    ]));
    expect(result.weakConcepts).toEqual([]);
    expect(result.repeatedMistakes).toEqual([]);
    expect(result.recommendedTeachingInterventions.some((item) => item.kind === 'isolated_error_review')).toBe(true);
  });

  it('requires multiple consistent observations before reporting mastery', () => {
    const attempts = Array.from({ length: 6 }, (_, index) => attempt({
      questionId: `q-${index}`,
      isCorrect: true,
    }));
    const result = diagnoseStudent(profile(attempts));
    expect(result.overallStatus).toBe('strong');
    expect(result.strongConcepts[0].status).toBe('mastered');
    expect(result.strongConcepts[0].confidence).toBe('high');

    const oneCorrect = diagnoseStudent(profile([attempt({ questionId: 'q-one', isCorrect: true })]));
    expect(oneCorrect.strongConcepts).toEqual([]);
  });

  it('identifies conflicting recent and historical performance', () => {
    const attempts = [
      ...Array.from({ length: 4 }, (_, index) => attempt({ questionId: `old-${index}`, isCorrect: true })),
      ...Array.from({ length: 4 }, (_, index) => attempt({ questionId: `new-${index}`, isCorrect: false })),
    ];
    const result = diagnoseStudent(profile(attempts));
    expect(result.emergingKnowledgeGaps.some((item) => item.status === 'declining' || item.status === 'inconsistent')).toBe(true);
  });

  it('reports repeated selection of the same wrong option as evidence', () => {
    const attempts = Array.from({ length: 3 }, (_, index) => attempt({
      questionId: `q-${index}`,
      isCorrect: false,
      selectedOption: 2,
    }));
    const result = diagnoseStudent(profile(attempts));
    expect(profile(attempts).behaviour.frequentlySelectedIncorrectOptions[0].count).toBe(3);
    expect(result.recommendedTeachingInterventions.some((item) =>
      item.kind === 'reteach_alternative' && item.reason.includes('same incorrect option')
    )).toBe(true);
  });

  it('uses persisted repeated-mistake memory without treating success memory as mastery', () => {
    const attempts = [
      attempt({ questionId: 'q1', isCorrect: false }),
      attempt({ questionId: 'q2', isCorrect: true }),
      attempt({ questionId: 'q3', isCorrect: false }),
    ];
    const memory = [
      { type: 'REPEATED_MISTAKE', conceptId: 101, key: 'incorrect-answer:q1', details: {}, occurredAt: new Date('2026-11-01T10:00:00Z') },
      { type: 'REPEATED_MISTAKE', conceptId: 101, key: 'incorrect-answer:q3', details: {}, occurredAt: new Date('2026-11-05T10:00:00Z') },
      { type: 'SUCCESSFUL_APPROACH', conceptId: 101, key: 'successful-retrieval', details: {}, occurredAt: new Date('2026-11-05T10:00:00Z') },
    ];
    const result = diagnoseStudent(profile(attempts, [], memory));
    expect(result.recommendedTeachingInterventions.some((item) =>
      item.kind === 'reteach_alternative' && item.conceptId === 101
    )).toBe(true);
  });

  it('distinguishes missing response metrics from poor performance', () => {
    const result = diagnoseStudent(profile([
      attempt({ timeTaken: 0 }),
      attempt({ timeTaken: 0 }),
    ]));
    expect(result.confidence).toBe('low');
    expect(result.evidence[0].message).toContain('2 total attempts');
  });

  it('detects improvement across multiple sessions', () => {
    const sessions = [
      { id: 's1', startedAt: new Date('2026-10-01T10:00:00Z'), endedAt: new Date('2026-10-01T10:30:00Z'), totalQ: 4, correctQ: 1, focusConceptId: 101 },
      { id: 's2', startedAt: new Date('2026-10-03T10:00:00Z'), endedAt: new Date('2026-10-03T10:30:00Z'), totalQ: 4, correctQ: 1, focusConceptId: 101 },
      { id: 's3', startedAt: new Date('2026-11-01T10:00:00Z'), endedAt: new Date('2026-11-01T10:30:00Z'), totalQ: 4, correctQ: 4, focusConceptId: 101 },
      { id: 's4', startedAt: new Date('2026-11-03T10:00:00Z'), endedAt: new Date('2026-11-03T10:30:00Z'), totalQ: 4, correctQ: 4, focusConceptId: 101 },
    ];
    const result = diagnoseStudent(profile([], sessions));
    expect(result.improvementPatterns[0].message).toContain('improved materially');
  });

  it('detects regression after previously strong session performance', () => {
    const sessions = [
      { id: 's1', startedAt: new Date('2026-10-01T10:00:00Z'), endedAt: new Date('2026-10-01T10:30:00Z'), totalQ: 4, correctQ: 4, focusConceptId: 101 },
      { id: 's2', startedAt: new Date('2026-10-03T10:00:00Z'), endedAt: new Date('2026-10-03T10:30:00Z'), totalQ: 4, correctQ: 4, focusConceptId: 101 },
      { id: 's3', startedAt: new Date('2026-11-01T10:00:00Z'), endedAt: new Date('2026-11-01T10:30:00Z'), totalQ: 4, correctQ: 1, focusConceptId: 101 },
      { id: 's4', startedAt: new Date('2026-11-03T10:00:00Z'), endedAt: new Date('2026-11-03T10:30:00Z'), totalQ: 4, correctQ: 1, focusConceptId: 101 },
    ];
    const result = diagnoseStudent(profile([], sessions));
    expect(result.improvementPatterns[0].message).toContain('declined');
  });
});
