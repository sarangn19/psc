import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTeachingContext, serializeTeachingContext, validateTeacherReply } from '../src/lib/teachingContext';
import type { StudentLearningProfile } from '../src/lib/studentLearningProfile';
import type { DiagnosticResult } from '../src/lib/diagnosticEngine';
import type { AdaptivePlanResult } from '../src/lib/adaptiveLearningPlanner';
import { generateOptional } from '../src/routes/teacher';

function profile(overrides: Partial<StudentLearningProfile> = {}): StudentLearningProfile {
  return {
    academic: {
      overall: { attempts: 4, correct: 2, accuracy: 50 },
      recent20: { attempts: 4, correct: 2, accuracy: 50 },
      historical: { attempts: 4, correct: 2, accuracy: 50 },
      subjects: [],
      chapters: [],
      concepts: [],
      strongConceptIds: [],
      weakConceptIds: [101],
      unpractisedConceptIds: [],
    },
    behaviour: {
      averageResponseTimeMs: null,
      responseTimeSampleSize: 0,
      correctStreak: 0,
      incorrectStreak: 1,
      hintUsage: { dataAvailable: false, totalHints: null, hintDependency: null },
      repeatedMistakes: [{ questionId: 'q1', conceptId: 101, incorrectAttempts: 3 }],
      frequentlySelectedIncorrectOptions: [{ conceptId: 101, selectedOption: 1, count: 2 }],
    },
    history: {
      lastPracticeAt: new Date('2026-11-01T10:00:00Z'),
      lastSuccessfulAttemptAt: null,
      lastIncorrectAttemptAt: new Date('2026-11-01T10:00:00Z'),
      practisedSubjectIds: ['subject-1'],
      practisedChapterIds: ['chapter-1'],
      previouslyMasteredConceptIds: [],
      conceptsRequiringRevision: [101],
      sessionPerformance: [],
    },
    currentState: {
      adaptiveSessionId: 'session-1',
      questionsCompleted: 4,
      correctAnswers: 2,
      sessionDurationMs: 600000,
      recentAccuracy: 50,
      currentLearningFocusId: 101,
      studentReportedDifficulty: null,
      studentReportedFatigue: null,
    },
    data: { attemptCount: 4, conceptStatisticCount: 1, sessionCount: 2, selectedExamCount: 1 },
    ...overrides,
  };
}

function diagnostics(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    overallStatus: 'developing',
    subjectWiseStatus: [],
    conceptWiseMastery: [],
    weakConcepts: [],
    strongConcepts: [],
    repeatedMistakes: [],
    emergingKnowledgeGaps: [],
    improvementPatterns: [],
    revisionRecommendations: [],
    recommendedTeachingInterventions: [{
      kind: 'reteach_alternative',
      conceptId: 101,
      reason: 'Repeat this concept with a different explanation.',
      priority: 'high',
    }],
    confidence: 'medium',
    evidence: [],
    ...overrides,
  };
}

function plan(overrides: Partial<AdaptivePlanResult> = {}): AdaptivePlanResult {
  return {
    selectedAction: 'revise',
    selectedConceptId: 101,
    selectedConceptName: 'Percentage Change',
    selectedDifficulty: 'EASY',
    selectionRationale: ['Repeated mistakes require revision.'],
    revisionPriority: 'high',
    retainCurrentTopic: true,
    availableQuestionConstraints: {
      selectedExamIds: ['exam-1'],
      selectedSubjectIds: [],
      availableQuestionCount: 4,
      matchingConceptCount: 1,
    },
    diagnosticEvidence: ['Three incorrect attempts establish a recurring difficulty.'],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_API_KEY;
  delete process.env.AI_API_URL;
  delete process.env.AI_PROVIDER;
});

describe('Phase 4 teaching intelligence integration', () => {
  it('constructs context from real profile, diagnostics and backend plan decisions', () => {
    const context = buildTeachingContext({
      profile: profile(),
      diagnostics: diagnostics(),
      plan: plan(),
      currentConceptName: 'Percentage Change',
      recentInteractions: [
        { sender: 'student', text: 'I am confused by the formula.' },
        { sender: 'teacher', text: 'Let us compare each quantity.' },
      ],
      studentFeedback: 'too difficult',
    });
    const serialized = serializeTeachingContext(context);
    expect(serialized).toContain('Backend-selected difficulty: EASY');
    expect(serialized).toContain('Retain current topic: yes');
    expect(serialized).toContain('Repeated incorrect attempts: 3');
    expect(serialized).toContain('Student feedback: too difficult');
    expect(context.recommendedIntervention).toContain('different explanation');
  });

  it('protects missing stored explanations without inventing source facts', () => {
    const context = buildTeachingContext({
      profile: profile(),
      diagnostics: diagnostics(),
      plan: plan(),
      currentQuestion: {
        text: 'A value increases by 10 percent. What happens when it decreases by 10 percent?',
        options: ['It returns to the original value', 'It remains 10 percent higher', 'It is lower than the original value'],
        correctOption: 2,
      },
    });
    const serialized = serializeTeachingContext(context);
    expect(serialized).toContain('Stored explanation unavailable');
    expect(serialized).toContain('do not fabricate one');
  });

  it('rejects an introduction that exposes the correct option text', () => {
    expect(validateTeacherReply({
      text: 'The correct answer is It is lower than the original value.',
      options: ['It returns to the original value', 'It remains 10 percent higher', 'It is lower than the original value'],
      correctOption: 2,
      revealAnswer: false,
    }).valid).toBe(false);
  });

  it('accepts hint-like response handling without revealing an answer', () => {
    const result = validateTeacherReply({
      text: 'Compare the two percentage changes against the same starting value.',
      options: ['A', 'B', 'C'],
      correctOption: 2,
      revealAnswer: false,
    });
    expect(result.valid).toBe(true);
  });

  it('does not allow AI output to override backend-selected plan difficulty or concept', () => {
    const context = buildTeachingContext({ profile: profile(), diagnostics: diagnostics(), plan: plan() });
    expect(context.currentObjective.toLowerCase()).toContain('revisit');
    expect(context.selectedDifficulty).toBe('EASY');
    expect(context.retainCurrentTopic).toBe(true);
  });

  it('handles missing student history explicitly', () => {
    const newProfile = profile({
      academic: { ...profile().academic, overall: { attempts: 0, correct: 0, accuracy: null }, concepts: [] },
      behaviour: { ...profile().behaviour, repeatedMistakes: [], frequentlySelectedIncorrectOptions: [], incorrectStreak: 0 },
    });
    const serialized = serializeTeachingContext(buildTeachingContext({
      profile: newProfile,
      diagnostics: diagnostics({ recommendedTeachingInterventions: [] }),
      plan: plan({ selectedAction: 'teach', selectedConceptId: null, retainCurrentTopic: false, revisionPriority: null, selectedDifficulty: 'EASY' }),
    }));
    expect(serialized).toContain('no measured history');
  });

  it('uses the configured provider and returns generated text', async () => {
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_API_URL = 'https://api.openrouter.ai/api/v1/chat/completions';
    process.env.AI_PROVIDER = 'openrouter';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
     JSON.stringify({ choices: [{ message: { content: 'Compare the starting values, then try one more item.' } }] }),
     { status: 200 },
    )));
    const result = await generateOptional('phase4-user', 'A short teaching prompt.');
    expect(result.status).toBe(200);
    expect(result.body.generated).toBe(true);
    expect(result.body.text).toContain('starting values');
  });

  it('returns unavailable when no provider is configured', async () => {
    const result = await generateOptional('phase4-no-provider', 'A prompt');
    expect(result.status).toBe(200);
    expect(result.body.generated).toBeUndefined();
    expect(result.body.unavailable).toBe(true);
    expect(result.body.message).toContain('AI generation is unavailable');
  });
});
