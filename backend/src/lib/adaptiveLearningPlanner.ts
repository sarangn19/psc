import type { DiagnosticResult, ConceptDiagnostic } from './diagnosticEngine';
import type { StudentLearningProfile } from './studentLearningProfile';

export type PlannerDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface AvailableConcept {
  conceptId: number;
  name?: string;
  questionCount: number;
  difficultyCounts?: Partial<Record<PlannerDifficulty, number>>;
  examIds?: string[];
  subjectIds?: string[];
  lastPractisedAt?: Date | null;
}

export interface AdaptivePlanInput {
  profile: StudentLearningProfile;
  diagnostics: DiagnosticResult;
  availableConcepts: AvailableConcept[];
  selectedExamIds: string[];
  selectedSubjectIds?: string[];
  currentLearningFocusId?: number | null;
}

export interface AdaptivePlanResult {
  selectedAction: 'teach' | 'recover' | 'revise' | 'verify' | 'progress' | 'no_available_question';
  selectedConceptId: number | null;
  selectedConceptName: string | null;
  selectedDifficulty: PlannerDifficulty;
  selectionRationale: string[];
  revisionPriority: 'high' | 'medium' | 'low' | null;
  retainCurrentTopic: boolean;
  availableQuestionConstraints: {
    selectedExamIds: string[];
    selectedSubjectIds: string[];
    availableQuestionCount: number;
    matchingConceptCount: number;
    selectedDifficultyQuestionCount?: number;
  };
  diagnosticEvidence: string[];
}

function eligibleConcepts(input: AdaptivePlanInput): AvailableConcept[] {
  const selectedExams = input.selectedExamIds;
  const selectedSubjects = input.selectedSubjectIds || [];
  return input.availableConcepts.filter((concept) =>
    concept.questionCount > 0 &&
    (!selectedExams.length || !concept.examIds?.length || concept.examIds.some((id) => selectedExams.includes(id))) &&
    (!selectedSubjects.length || !concept.subjectIds?.length || concept.subjectIds.some((id) => selectedSubjects.includes(id)))
  );
}

function conceptDiagnostic(diagnostics: DiagnosticResult, conceptId: number): ConceptDiagnostic | undefined {
  return diagnostics.conceptWiseMastery.find((item) => item.conceptId === conceptId);
}

function selectionDifficulty(
  diagnostic: ConceptDiagnostic | undefined,
  profile: StudentLearningProfile,
): PlannerDifficulty {
  const attempts = profile.academic.concepts.find((item) => item.conceptId === diagnostic?.conceptId)?.attempts || 0;
  if (!diagnostic || attempts === 0) return 'EASY';
  if (diagnostic.status === 'declining' || diagnostic.status === 'inconsistent' || diagnostic.mastery !== null && diagnostic.mastery < 60) {
    return 'EASY';
  }
  if (diagnostic.status === 'mastered' && attempts >= 6 && (diagnostic.mastery ?? 0) >= 80) return 'HARD';
  if (diagnostic.status === 'verified' || (diagnostic.mastery ?? 0) >= 75) return 'MEDIUM';
  return attempts < 3 ? 'EASY' : 'MEDIUM';
}

export function createAdaptiveLearningPlan(input: AdaptivePlanInput): AdaptivePlanResult {
  const candidates = eligibleConcepts(input);
  const constraints: AdaptivePlanResult['availableQuestionConstraints'] = {
    selectedExamIds: [...input.selectedExamIds],
    selectedSubjectIds: [...(input.selectedSubjectIds || [])],
    availableQuestionCount: candidates.reduce((sum, item) => sum + item.questionCount, 0),
    matchingConceptCount: candidates.length,
  };
  const currentFocus = input.currentLearningFocusId ?? input.profile.currentState.currentLearningFocusId;
  const focusAvailable = currentFocus !== null && candidates.some((item) => item.conceptId === currentFocus);

  if (!candidates.length) {
    return {
      selectedAction: 'no_available_question',
      selectedConceptId: null,
      selectedConceptName: null,
      selectedDifficulty: 'EASY',
      selectionRationale: ['No question is available for the selected exam and subject restrictions.'],
      revisionPriority: null,
      retainCurrentTopic: false,
      availableQuestionConstraints: constraints,
      diagnosticEvidence: ['Question availability came from the supplied concept pool; no unrelated topic was selected.'],
    };
  }

  let selected: AvailableConcept | undefined;
  let action: AdaptivePlanResult['selectedAction'] = 'teach';
  let retainCurrentTopic = false;
  const rationales: string[] = [];
  const evidence: string[] = [];
  const dueRevisionIds = new Set(
    (input.profile.behaviour.revisionSchedule || [])
      .filter((revision) => new Date(revision.dueAt).getTime() <= Date.now())
      .map((revision) => revision.conceptId),
  );

  if (currentFocus !== null && focusAvailable && input.profile.behaviour.incorrectStreak > 0) {
    selected = candidates.find((item) => item.conceptId === currentFocus);
    action = 'recover';
    retainCurrentTopic = true;
    rationales.push('Retain the current concept after an incorrect answer so the misunderstanding can be reworked.');
    evidence.push(`${input.profile.behaviour.incorrectStreak} incorrect answer(s) remain in the recent streak.`);
  }

  if (!selected) {
    const repeated = new Map(input.profile.behaviour.repeatedMistakes.map((item) => [item.conceptId, item.incorrectAttempts]));
    const weakIds = new Set(input.diagnostics.weakConcepts.map((item) => item.conceptId));
    const revisionIds = new Set(input.diagnostics.revisionRecommendations.map((item) => item.conceptId));
    const strongIds = new Set(input.diagnostics.strongConcepts.map((item) => item.conceptId));
    const unpractisedIds = new Set(input.profile.academic.unpractisedConceptIds);

    const ranked = candidates.map((concept) => {
      const profileConcept = input.profile.academic.concepts.find((item) => item.conceptId === concept.conceptId);
      const diagnostic = conceptDiagnostic(input.diagnostics, concept.conceptId);
      const repeatedCount = repeated.get(concept.conceptId) || 0;
      let score = 0;
      if (weakIds.has(concept.conceptId)) score += 100;
      if (repeatedCount >= 2) score += 80 + Math.min(repeatedCount, 5);
      if (revisionIds.has(concept.conceptId)) score += 55;
      if (dueRevisionIds.has(concept.conceptId)) score += 70;
      if (unpractisedIds.has(concept.conceptId)) score += 40;
      if (diagnostic?.status === 'declining' || diagnostic?.status === 'inconsistent') score += 35;
      if (strongIds.has(concept.conceptId)) score += 20;
      const practiceAge = concept.lastPractisedAt?.getTime()
        || profileConcept?.lastSuccessfulAttemptAt?.getTime()
        || profileConcept?.lastIncorrectAttemptAt?.getTime()
        || 0;
      score += practiceAge ? 0 : 25;
      return { concept, score, profileConcept, diagnostic };
    }).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aPractice = a.concept.lastPractisedAt?.getTime() || 0;
      const bPractice = b.concept.lastPractisedAt?.getTime() || 0;
      return aPractice - bPractice;
    });

    const choice = ranked[0];
    if (!choice) {
      return {
        selectedAction: 'no_available_question',
        selectedConceptId: null,
        selectedConceptName: null,
        selectedDifficulty: 'EASY',
        selectionRationale: ['No concept matched the available syllabus and exam restrictions.'],
        revisionPriority: null,
        retainCurrentTopic: false,
        availableQuestionConstraints: constraints,
        diagnosticEvidence: [],
      };
    }
    selected = choice.concept;

    if (repeated.get(selected.conceptId) && repeated.get(selected.conceptId)! >= 2) {
      action = 'revise';
      rationales.push('Revisit this concept because incorrect answers have recurred.');
    } else if (dueRevisionIds.has(selected.conceptId)) {
      action = 'revise';
      rationales.push('Prioritize the concept because its persisted revision date has arrived.');
    } else if (weakIds.has(selected.conceptId)) {
      action = 'recover';
      rationales.push('Prioritise this weak concept while keeping it from becoming the only repeated focus.');
    } else if (revisionIds.has(selected.conceptId)) {
      action = 'revise';
      rationales.push('Practice this concept through revision evidence from previous performance.');
    } else if (unpractisedIds.has(selected.conceptId)) {
      action = 'teach';
      rationales.push('Introduce an unpractised concept so syllabus coverage expands.');
    } else if (strongIds.has(selected.conceptId)) {
      action = 'progress';
      rationales.push('Progress this verified or mastered concept with more challenging practice.');
    } else {
      action = 'teach';
      rationales.push('Choose the next concept by coverage age and available diagnostic evidence.');
    }

    if (choice.diagnostic?.evidence.length) {
      evidence.push(...choice.diagnostic.evidence.map((item) => item.message));
    } else if (choice.profileConcept) {
      evidence.push(`${choice.profileConcept.name}: ${choice.profileConcept.attempts} attempt(s), accuracy ${choice.profileConcept.accuracy ?? 'not measured'}%.`);
    } else {
      evidence.push('No prior concept attempts are available for this candidate.');
    }
  }

  const diagnostic = conceptDiagnostic(input.diagnostics, selected.conceptId);
  if (diagnostic?.evidence.length && !evidence.some((item) => diagnostic.evidence.some((source) => source.message === item))) {
    evidence.push(...diagnostic.evidence.map((item) => item.message));
  }

  const revisionPriority = input.diagnostics.revisionRecommendations.find((item) => item.conceptId === selected!.conceptId)?.priority
    || (dueRevisionIds?.has(selected!.conceptId) ? 'high' : null)
    || (input.diagnostics.weakConcepts.some((item) => item.conceptId === selected!.conceptId) ? 'high' : null);
  let selectedDifficulty = selectionDifficulty(diagnostic, input.profile);
  if (selected.difficultyCounts) {
    const preferredCount = selected.difficultyCounts[selectedDifficulty] || 0;
    if (preferredCount === 0) {
      const fallbackOrder: PlannerDifficulty[] =
        selectedDifficulty === 'HARD' ? ['MEDIUM', 'EASY'] :
        selectedDifficulty === 'EASY' ? ['MEDIUM', 'HARD'] : ['EASY', 'HARD'];
      selectedDifficulty = fallbackOrder.find((difficulty) => (selected.difficultyCounts![difficulty] || 0) > 0) || selectedDifficulty;
    }
    constraints.selectedDifficultyQuestionCount = selected.difficultyCounts[selectedDifficulty] || 0;
  }

  return {
    selectedAction: action,
    selectedConceptId: selected.conceptId,
    selectedConceptName: selected.name || diagnostic?.name || null,
    selectedDifficulty,
    selectionRationale: rationales,
    revisionPriority,
    retainCurrentTopic,
    availableQuestionConstraints: constraints,
    diagnosticEvidence: evidence,
  };
}
