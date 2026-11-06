import { describe, expect, it } from 'vitest';
import { createAdaptiveLearningPlan, AvailableConcept } from '../src/lib/adaptiveLearningPlanner';
import type { DiagnosticResult, ConceptDiagnostic } from '../src/lib/diagnosticEngine';
import type { StudentLearningProfile, ConceptPerformance } from '../src/lib/studentLearningProfile';

function concept(
  conceptId: number,
  name: string,
  attempts = 0,
  correct = 0,
  status: ConceptDiagnostic['status'] = attempts ? 'developing' : 'insufficient_data',
): ConceptPerformance {
  return {
    conceptId,
    name,
    attempts,
    correct,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : null,
    recent20: { attempts, correct, accuracy: attempts ? Math.round((correct / attempts) * 100) : null },
    historicalBeforeRecent20: { attempts: 0, correct: 0, accuracy: null },
    lastSuccessfulAttemptAt: null,
    lastIncorrectAttemptAt: null,
  };
}

function profile(overrides: Partial<StudentLearningProfile> = {}): StudentLearningProfile {
  return {
    academic: {
      overall: { attempts: 0, correct: 0, accuracy: null },
      recent20: { attempts: 0, correct: 0, accuracy: null },
      historical: { attempts: 0, correct: 0, accuracy: null },
      subjects: [],
      chapters: [],
      concepts: [],
      strongConceptIds: [],
      weakConceptIds: [],
      unpractisedConceptIds: [],
    },
    behaviour: {
      averageResponseTimeMs: null,
      responseTimeSampleSize: 0,
      correctStreak: 0,
      incorrectStreak: 0,
      hintUsage: { dataAvailable: false, totalHints: null, hintDependency: null },
      repeatedMistakes: [],
      frequentlySelectedIncorrectOptions: [],
    },
    history: {
      lastPracticeAt: null,
      lastSuccessfulAttemptAt: null,
      lastIncorrectAttemptAt: null,
      practisedSubjectIds: [],
      practisedChapterIds: [],
      previouslyMasteredConceptIds: [],
      conceptsRequiringRevision: [],
      sessionPerformance: [],
    },
    currentState: {
      adaptiveSessionId: null,
      questionsCompleted: 0,
      correctAnswers: 0,
      sessionDurationMs: null,
      recentAccuracy: null,
      currentLearningFocusId: null,
      studentReportedDifficulty: null,
      studentReportedFatigue: null,
    },
    data: { attemptCount: 0, conceptStatisticCount: 0, sessionCount: 0, selectedExamCount: 0 },
    ...overrides,
  };
}

function diagnostics(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    overallStatus: 'insufficient_data',
    subjectWiseStatus: [],
    conceptWiseMastery: [],
    weakConcepts: [],
    strongConcepts: [],
    repeatedMistakes: [],
    emergingKnowledgeGaps: [],
    improvementPatterns: [],
    revisionRecommendations: [],
    recommendedTeachingInterventions: [],
    confidence: 'low',
    evidence: [],
    ...overrides,
  };
}

const available: AvailableConcept[] = [
  { conceptId: 101, name: 'Percentages', questionCount: 5, examIds: ['ssc'], difficultyCounts: { EASY: 3, MEDIUM: 2 } },
  { conceptId: 102, name: 'Ratio', questionCount: 4, examIds: ['ssc'], difficultyCounts: { MEDIUM: 3, HARD: 1 } },
];

describe('Adaptive Learning Planner Phase 3', () => {
  it('starts a new student at an easy unpractised concept', () => {
    const student = profile({
      academic: { ...profile().academic, unpractisedConceptIds: [101, 102] },
      data: { attemptCount: 0, conceptStatisticCount: 0, sessionCount: 0, selectedExamCount: 1 },
    });
    const result = createAdaptiveLearningPlan({ profile: student, diagnostics: diagnostics(), availableConcepts: available, selectedExamIds: ['ssc'] });
    expect(result.selectedConceptId).not.toBeNull();
    expect(result.selectedAction).toBe('teach');
    expect(result.selectedDifficulty).toBe('EASY');
  });

  it('prioritises a weak concept rather than a strong concept', () => {
    const weak = concept(101, 'Percentages', 4, 1, 'developing');
    const strong = concept(102, 'Ratio', 6, 6, 'mastered');
    const student = profile({ academic: { ...profile().academic, concepts: [weak, strong] } });
    const result = createAdaptiveLearningPlan({
      profile: student,
      diagnostics: diagnostics({
        weakConcepts: [{ conceptId: 101, name: 'Percentages', mastery: 25, status: 'developing', confidence: 'medium', evidence: [] }],
      }),
      availableConcepts: available,
      selectedExamIds: ['ssc'],
    });
    expect(result.selectedConceptId).toBe(101);
    expect(result.revisionPriority).toBe('high');
    expect(result.selectedDifficulty).toBe('EASY');
  });

  it('retains the current topic after a wrong answer', () => {
    const student = profile({
      behaviour: { ...profile().behaviour, incorrectStreak: 1 },
      currentState: { ...profile().currentState, currentLearningFocusId: 102 },
    });
    const result = createAdaptiveLearningPlan({ profile: student, diagnostics: diagnostics(), availableConcepts: available, selectedExamIds: ['ssc'] });
    expect(result.selectedConceptId).toBe(102);
    expect(result.retainCurrentTopic).toBe(true);
    expect(result.selectedAction).toBe('recover');
  });

  it('does not reduce difficulty for one isolated mistake', () => {
    const student = profile({
      behaviour: { ...profile().behaviour, incorrectStreak: 1 },
      currentState: { ...profile().currentState, currentLearningFocusId: 102 },
      academic: { ...profile().academic, concepts: [concept(102, 'Ratio', 6, 5, 'mastered')] },
    });
    const result = createAdaptiveLearningPlan({
      profile: student,
      diagnostics: diagnostics({
        conceptWiseMastery: [{ conceptId: 102, name: 'Ratio', mastery: 83, status: 'mastered', confidence: 'high', evidence: [] }],
        strongConcepts: [{ conceptId: 102, name: 'Ratio', mastery: 83, status: 'mastered', confidence: 'high', evidence: [] }],
      }),
      availableConcepts: available,
      selectedExamIds: ['ssc'],
    });
    expect(result.retainCurrentTopic).toBe(true);
    expect(result.selectedDifficulty).toBe('HARD');
  });

  it('plans harder practice for consistently strong students', () => {
    const student = profile({ academic: { ...profile().academic, concepts: [concept(102, 'Ratio', 8, 7, 'mastered')] } });
    const result = createAdaptiveLearningPlan({
      profile: student,
      diagnostics: diagnostics({
        conceptWiseMastery: [{ conceptId: 102, name: 'Ratio', mastery: 88, status: 'mastered', confidence: 'high', evidence: [] }],
        strongConcepts: [{ conceptId: 102, name: 'Ratio', mastery: 88, status: 'mastered', confidence: 'high', evidence: [] }],
      }),
      availableConcepts: available,
      selectedExamIds: ['ssc'],
    });
    expect(result.selectedAction).toBe('progress');
    expect(result.selectedDifficulty).toBe('HARD');
  });

  it('prioritises repeated mistakes', () => {
    const student = profile({ behaviour: { ...profile().behaviour, repeatedMistakes: [{ questionId: 'q1', conceptId: 101, incorrectAttempts: 3 }] } });
    const result = createAdaptiveLearningPlan({ profile: student, diagnostics: diagnostics(), availableConcepts: available, selectedExamIds: ['ssc'] });
    expect(result.selectedConceptId).toBe(101);
    expect(result.selectedAction).toBe('revise');
  });

  it('rotates between weak candidates instead of repeatedly selecting one', () => {
    const student = profile({
      academic: { ...profile().academic, concepts: [concept(101, 'Percentages', 4, 1), concept(102, 'Ratio', 4, 1)] },
    });
    const result = createAdaptiveLearningPlan({
      profile: student,
      diagnostics: diagnostics({
        weakConcepts: [
          { conceptId: 101, name: 'Percentages', mastery: 25, status: 'developing', confidence: 'medium', evidence: [] },
          { conceptId: 102, name: 'Ratio', mastery: 25, status: 'developing', confidence: 'medium', evidence: [] },
        ],
      }),
      availableConcepts: available,
      selectedExamIds: ['ssc'],
    });
    expect([101, 102]).toContain(result.selectedConceptId);
  });

  it('reports missing question availability without selecting an unrelated concept', () => {
    const result = createAdaptiveLearningPlan({ profile: profile(), diagnostics: diagnostics(), availableConcepts: [], selectedExamIds: ['banking'] });
    expect(result.selectedAction).toBe('no_available_question');
    expect(result.selectedConceptId).toBeNull();
  });

  it('does not expose concepts outside selected exams', () => {
    const result = createAdaptiveLearningPlan({
      profile: profile(),
      diagnostics: diagnostics(),
      availableConcepts: [{ conceptId: 999, name: 'Other exam concept', questionCount: 2, examIds: ['other'] }],
      selectedExamIds: ['ssc'],
    });
    expect(result.selectedAction).toBe('no_available_question');
    expect(result.availableQuestionConstraints.matchingConceptCount).toBe(0);
  });

  it('uses conflicting diagnostic evidence conservatively', () => {
    const student = profile({ academic: { ...profile().academic, concepts: [concept(101, 'Percentages', 3, 2, 'inconsistent')] } });
    const result = createAdaptiveLearningPlan({
      profile: student,
      diagnostics: diagnostics({
        conceptWiseMastery: [{ conceptId: 101, name: 'Percentages', mastery: 67, status: 'inconsistent', confidence: 'medium', evidence: [] }],
        emergingKnowledgeGaps: [{ conceptId: 101, name: 'Percentages', mastery: 67, status: 'inconsistent', confidence: 'medium', evidence: [] }],
      }),
      availableConcepts: available,
      selectedExamIds: ['ssc'],
    });
    expect(result.selectedDifficulty).toBe('EASY');
    expect(result.selectedConceptId).toBe(101);
  });

  it('prioritises a persisted revision that is due and keeps it exam-restricted', () => {
    const student = profile({
      behaviour: {
        ...profile().behaviour,
        revisionSchedule: [{
          conceptId: 101,
          masterySnapshot: 45,
          intervalDays: 1,
          dueAt: new Date('2020-01-01T00:00:00.000Z'),
          consecutiveSuccesses: 0,
          lastResultCorrect: false,
          lastReviewedAt: new Date('2019-12-31T00:00:00.000Z'),
        }],
      },
    });
    const result = createAdaptiveLearningPlan({
      profile: student,
      diagnostics: diagnostics(),
      availableConcepts: available,
      selectedExamIds: ['ssc'],
    });
    expect(result.selectedConceptId).toBe(101);
    expect(result.selectedAction).toBe('revise');
    expect(result.revisionPriority).toBe('high');
  });
});
