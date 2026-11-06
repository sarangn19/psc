import type { DiagnosticResult } from './diagnosticEngine';
import type { StudentLearningProfile } from './studentLearningProfile';
import type { AdaptivePlanResult } from './adaptiveLearningPlanner';

export interface TeachingInteraction {
  sender: 'student' | 'teacher';
  text: string;
}

export interface TeachingContextInput {
  profile: StudentLearningProfile;
  diagnostics: DiagnosticResult;
  plan: AdaptivePlanResult;
  currentConceptName?: string | null;
  currentQuestion?: {
    text: string;
    options: string[];
    correctOption?: number;
    storedExplanation?: string | null;
  } | null;
  recentInteractions?: TeachingInteraction[];
  studentMessage?: string | null;
  missingExplanation?: boolean;
  studentFeedback?: string | null;
}

export interface TeachingContext {
  currentConceptName: string | null;
  currentObjective: string;
  masteryEvidence: string[];
  recentMistakes: string[];
  diagnostics: DiagnosticResult;
  selectedDifficulty: AdaptivePlanResult['selectedDifficulty'];
  recommendedIntervention: string | null;
  revisionPriority: AdaptivePlanResult['revisionPriority'];
  retainCurrentTopic: boolean;
  previousInteractions: TeachingInteraction[];
  studentFeedback: string | null;
  factualQuestionContext: TeachingContextInput['currentQuestion'];
  persistentMemory: string[];
  structuredFeedback: string[];
  revisionSchedule: string[];
}

export function buildTeachingContext(input: TeachingContextInput): TeachingContext {
  const conceptId = input.plan.selectedConceptId;
  const conceptEvidence = input.profile.academic.concepts
    .filter((concept) => conceptId === null || concept.conceptId === conceptId)
    .map((concept) => `${concept.name}: ${concept.attempts} attempts, ${concept.accuracy ?? 'unmeasured'} accuracy.`);

  const diagnosticEvidence = input.diagnostics.evidence.map((item) => item.message);
  const relevantDiagnostics = input.diagnostics.recommendedTeachingInterventions
    .filter((item) => conceptId === null || item.conceptId === conceptId);

  return {
    currentConceptName: input.currentConceptName || input.plan.selectedConceptName,
    currentObjective:
      input.plan.selectedAction === 'revise'
        ? 'Revisit and re-explain the repeated misunderstanding.'
        : input.plan.selectedAction === 'recover'
          ? 'Help the student recover from the current misunderstanding.'
          : input.plan.selectedAction === 'progress'
            ? 'Challenge the student with a stronger application.'
            : input.plan.selectedAction === 'no_available_question'
              ? 'Explain that no stored question is currently available.'
              : 'Teach and verify the selected concept.',
    masteryEvidence: [...conceptEvidence, ...diagnosticEvidence].slice(0, 12),
    recentMistakes: [
      ...input.profile.behaviour.repeatedMistakes
        .filter((item) => conceptId === null || item.conceptId === conceptId)
        .map((item) => `Repeated incorrect attempts: ${item.incorrectAttempts}.`),
      ...input.profile.behaviour.frequentlySelectedIncorrectOptions
        .filter((item) => conceptId === null || item.conceptId === conceptId)
        .map((item) => `Incorrect option index ${item.selectedOption} selected ${item.count} time(s).`),
    ],
    diagnostics: input.diagnostics,
    selectedDifficulty: input.plan.selectedDifficulty,
    recommendedIntervention: relevantDiagnostics[0]?.reason || null,
    revisionPriority: input.plan.revisionPriority,
    retainCurrentTopic: input.plan.retainCurrentTopic,
    previousInteractions: (input.recentInteractions || []).slice(-8),
    studentFeedback: input.studentFeedback || input.profile.currentState.studentReportedDifficulty || input.profile.currentState.studentReportedFatigue || null,
    factualQuestionContext: input.currentQuestion || null,
    persistentMemory: (input.profile.behaviour.persistentMemory || [])
      .slice(0, 12)
      .map((item) => {
        const details = typeof item.details === 'object' && item.details !== null
          ? JSON.stringify(item.details).slice(0, 240)
          : String(item.details || '').slice(0, 240);
        return `${item.type}: ${item.key}${details ? ` (${details})` : ''}`;
      }),
    structuredFeedback: (input.profile.behaviour.learningFeedback || [])
      .slice(0, 10)
      .map((item) => `${item.type}${item.conceptId ? ` (concept ${item.conceptId})` : ''}${item.message ? `: ${item.message}` : ''}`),
    revisionSchedule: (input.profile.behaviour.revisionSchedule || [])
      .filter((item) => item.dueAt.getTime() <= Date.now())
      .slice(0, 10)
      .map((item) => `Concept ${item.conceptId}: due ${item.dueAt.toISOString()}, interval ${item.intervalDays} day(s), ${item.lastResultCorrect === false ? 'last result incorrect' : item.lastResultCorrect === true ? 'last result correct' : 'no previous review result'}.`),
  };
}

export function serializeTeachingContext(context: TeachingContext): string {
  const question = context.factualQuestionContext;
  const history = context.previousInteractions.map((item) =>
    `${item.sender === 'student' ? 'Student' : 'Teacher'}: ${item.text.slice(0, 500)}`
  ).join('\n');
  return [
    'BACKEND TEACHING CONTEXT - This data controls the teaching objective and difficulty.',
    `Current objective: ${context.currentObjective}`,
    `Backend-selected difficulty: ${context.selectedDifficulty}`,
    `Retain current topic: ${context.retainCurrentTopic ? 'yes' : 'no'}`,
    `Revision priority: ${context.revisionPriority || 'none'}`,
    context.recommendedIntervention ? `Recommended intervention: ${context.recommendedIntervention}` : '',
    context.masteryEvidence.length ? `Mastery evidence: ${context.masteryEvidence.join(' ')}` : 'Mastery evidence: no measured history.',
    context.recentMistakes.length ? `Recent mistakes: ${context.recentMistakes.join(' ')}` : 'Recent mistakes: none established.',
    context.studentFeedback ? `Student feedback: ${context.studentFeedback}` : 'Student feedback: unavailable.',
    context.structuredFeedback.length ? `Persisted learning feedback: ${context.structuredFeedback.join('; ')}` : '',
    context.revisionSchedule.length ? `Due revision schedule: ${context.revisionSchedule.join(' ')}` : '',
    context.persistentMemory.length ? `Persistent learning memory: ${context.persistentMemory.join('; ')}` : '',
    question
      ? [
          'Verified question context:',
          question.text,
          `Options: ${question.options.map((option, index) => `${String.fromCharCode(65 + index)}: ${option}`).join('; ')}`,
          typeof question.correctOption === 'number' ? `Verified correct option: ${String.fromCharCode(65 + question.correctOption)}: ${question.options[question.correctOption] || ''}` : '',
          question.storedExplanation ? `Verified stored explanation: ${question.storedExplanation}` : 'Stored explanation unavailable; do not fabricate one.',
        ].join('\n')
      : '',
    history ? `Previous interactions:\n${history}` : 'Previous interactions: unavailable.',
  ].filter(Boolean).join('\n');
}

export function validateTeacherReply(input: {
  text: string;
  options?: string[];
  correctOption?: number;
  revealAnswer?: boolean;
}): { valid: boolean; reason: string | null } {
  const text = input.text.trim();
  if (!text || text.length > 4000) {
    return { valid: false, reason: 'empty or unexpectedly long generated reply' };
  }
  if (!input.revealAnswer && typeof input.correctOption === 'number' && input.options?.length) {
    const correct = input.options[input.correctOption]?.trim();
    const letter = String.fromCharCode(65 + input.correctOption);
    if (correct && correct.length >= 3 && text.toLowerCase().includes(correct.toLowerCase())) {
      return { valid: false, reason: 'generated reply appears to reveal the correct answer' };
    }
    const revealPattern = new RegExp(`(?:correct answer|answer is|choose|option)\\s+(?:${letter}|option\\s+${letter})`, 'i');
    if (revealPattern.test(text)) {
      return { valid: false, reason: 'generated reply appears to reveal the correct option letter' };
    }
  }
  return { valid: true, reason: null };
}
