import type { StudentLearningProfile } from './studentLearningProfile';

export type DiagnosticConfidence = 'high' | 'medium' | 'low';
export type OverallLearningStatus = 'insufficient_data' | 'developing' | 'mixed' | 'stable' | 'strong';

export interface DiagnosticEvidence {
  source: 'attempt_history' | 'concept_stats' | 'session_history' | 'wrong_option_history' | 'hint_history' | 'feedback_history' | 'revision_history' | 'memory_history';
  message: string;
}

export interface ConceptDiagnostic {
  conceptId: number;
  name: string;
  mastery: number | null;
  status: 'insufficient_data' | 'developing' | 'mastered' | 'verified' | 'declining' | 'inconsistent';
  confidence: DiagnosticConfidence;
  evidence: DiagnosticEvidence[];
}

export interface SubjectDiagnostic {
  subjectId: string;
  name: string;
  accuracy: number | null;
  status: 'insufficient_data' | 'developing' | 'stable' | 'strong';
  attempts: number;
  confidence: DiagnosticConfidence;
  evidence: DiagnosticEvidence[];
}

export interface RepeatedMistakeDiagnostic {
  questionId: string;
  conceptId: number | null;
  incorrectAttempts: number;
  confidence: DiagnosticConfidence;
}

export interface RevisionRecommendation {
  conceptId: number;
  name: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  confidence: DiagnosticConfidence;
}

export interface TeachingIntervention {
  kind:
    | 'teach_foundation'
    | 'reteach_alternative'
    | 'retrieval_practice'
    | 'reduce_hints'
    | 'maintain_challenge'
    | 'verify_understanding'
    | 'review_revision'
    | 'isolated_error_review';
  conceptId: number | null;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface DiagnosticResult {
  overallStatus: OverallLearningStatus;
  subjectWiseStatus: SubjectDiagnostic[];
  conceptWiseMastery: ConceptDiagnostic[];
  weakConcepts: ConceptDiagnostic[];
  strongConcepts: ConceptDiagnostic[];
  repeatedMistakes: RepeatedMistakeDiagnostic[];
  emergingKnowledgeGaps: ConceptDiagnostic[];
  improvementPatterns: Array<{ message: string; evidence: DiagnosticEvidence[]; confidence: DiagnosticConfidence }>;
  revisionRecommendations: RevisionRecommendation[];
  recommendedTeachingInterventions: TeachingIntervention[];
  confidence: DiagnosticConfidence;
  evidence: DiagnosticEvidence[];
}

function confidenceFromAttempts(attempts: number): DiagnosticConfidence {
  if (attempts >= 6) return 'high';
  if (attempts >= 3) return 'medium';
  return 'low';
}

export function diagnoseStudent(profile: StudentLearningProfile): DiagnosticResult {
  const repeatedMemoryCountByConcept = new Map<number, number>();
  for (const memory of profile.behaviour.persistentMemory || []) {
    if (memory.type === 'REPEATED_MISTAKE' && memory.conceptId !== null) {
      repeatedMemoryCountByConcept.set(
        memory.conceptId,
        (repeatedMemoryCountByConcept.get(memory.conceptId) || 0) + 1,
      );
    }
  }
  const conceptWiseMastery: ConceptDiagnostic[] = profile.academic.concepts.map((concept) => {
    const attempts = concept.attempts;
    const accuracy = concept.accuracy;
    const recentAccuracy = concept.recent20.accuracy;
    const historicalAccuracy = concept.historicalBeforeRecent20.accuracy;
    const evidence: DiagnosticEvidence[] = [
      {
        source: 'attempt_history',
        message: `${concept.name}: ${attempts} historical attempt${attempts === 1 ? '' : 's'}, accuracy ${accuracy ?? 'not measured'}%.`,
      },
    ];
    if (concept.recent20.attempts > 0) {
      evidence.push({
        source: 'attempt_history',
        message: `${concept.recent20.attempts} recent attempt${concept.recent20.attempts === 1 ? '' : 's'}; recent accuracy ${recentAccuracy ?? 'not measured'}%.`,
      });
    }

    let status: ConceptDiagnostic['status'] = 'insufficient_data';
    if (attempts >= 6 && accuracy !== null && accuracy >= 80 && (recentAccuracy === null || recentAccuracy >= 75)) {
      status = 'mastered';
    } else if (attempts >= 3 && historicalAccuracy !== null && recentAccuracy !== null && historicalAccuracy - recentAccuracy >= 20) {
      status = 'declining';
    } else if (attempts >= 3 && historicalAccuracy !== null && recentAccuracy !== null && Math.abs(historicalAccuracy - recentAccuracy) >= 20) {
      status = 'inconsistent';
    } else if (attempts >= 3 && accuracy !== null && accuracy >= 80 && recentAccuracy !== null && recentAccuracy >= 60 && recentAccuracy < 80) {
      status = 'verified';
    } else if (attempts > 0) {
      status = 'developing';
    }

    return {
      conceptId: concept.conceptId,
      name: concept.name,
      mastery: accuracy,
      status,
      confidence: confidenceFromAttempts(attempts),
      evidence,
    };
  });

  const weakConcepts = conceptWiseMastery.filter((concept) => {
    const profileConcept = profile.academic.concepts.find((item) => item.conceptId === concept.conceptId);
    if (!profileConcept || profileConcept.attempts < 3) return false;
    const repeated = profile.behaviour.repeatedMistakes.some((item) => item.conceptId === concept.conceptId);
    const repeatedAcrossQuestionsOrSessions = (repeatedMemoryCountByConcept.get(concept.conceptId) || 0) >= 2;
    return repeated || repeatedAcrossQuestionsOrSessions || (profileConcept.accuracy !== null && profileConcept.accuracy < 60) ||
      (profileConcept.recent20.accuracy !== null && profileConcept.recent20.accuracy < 60 && profileConcept.recent20.attempts >= 3);
  });

  const strongConcepts = conceptWiseMastery.filter((item) => item.status === 'mastered' || item.status === 'verified');
  const emergingKnowledgeGaps = conceptWiseMastery.filter((item) =>
    weakConcepts.some((weak) => weak.conceptId === item.conceptId) ||
    item.status === 'declining' ||
    item.status === 'inconsistent'
  );

  const repeatedMistakes: RepeatedMistakeDiagnostic[] = profile.behaviour.repeatedMistakes.map((mistake) => ({
    questionId: mistake.questionId,
    conceptId: mistake.conceptId,
    incorrectAttempts: mistake.incorrectAttempts,
    confidence: mistake.incorrectAttempts >= 3 ? 'high' : 'medium',
  }));

  const subjectWiseStatus: SubjectDiagnostic[] = profile.academic.subjects.map((subject) => {
    const evidence: DiagnosticEvidence[] = [{
      source: 'attempt_history',
      message: `${subject.name}: ${subject.attempts} attempts, accuracy ${subject.accuracy ?? 'not measured'}%.`,
    }];
    const status: SubjectDiagnostic['status'] = subject.attempts === 0 || subject.accuracy === null
      ? 'insufficient_data'
      : subject.accuracy >= 80 && subject.attempts >= 6
        ? 'strong'
        : subject.accuracy >= 60
          ? 'stable'
          : 'developing';
    return {
      subjectId: subject.subjectId,
      name: subject.name,
      accuracy: subject.accuracy,
      status,
      attempts: subject.attempts,
      confidence: confidenceFromAttempts(subject.attempts),
      evidence,
    };
  });

  const sessions = profile.history.sessionPerformance.filter((session) => session.accuracy !== null);
  const improvementPatterns: DiagnosticResult['improvementPatterns'] = [];
  if (sessions.length >= 4) {
    const midpoint = Math.floor(sessions.length / 2);
    const earlier = sessions.slice(0, midpoint);
    const later = sessions.slice(midpoint);
    const earlierAccuracy = earlier.reduce((sum, session) => sum + (session.accuracy || 0), 0) / earlier.length;
    const laterAccuracy = later.reduce((sum, session) => sum + (session.accuracy || 0), 0) / later.length;
    if (laterAccuracy - earlierAccuracy >= 15) {
      improvementPatterns.push({
        message: 'Across multiple sessions, recent session accuracy improved materially over earlier sessions.',
        evidence: [{
          source: 'session_history',
          message: `Earlier-session mean ${Math.round(earlierAccuracy)}%; later-session mean ${Math.round(laterAccuracy)}%.`,
        }],
        confidence: later.length >= 3 ? 'high' : 'medium',
      });
    } else if (earlierAccuracy - laterAccuracy >= 15) {
      improvementPatterns.push({
        message: 'Across multiple sessions, recent session accuracy declined after earlier success.',
        evidence: [{
          source: 'session_history',
          message: `Earlier-session mean ${Math.round(earlierAccuracy)}%; later-session mean ${Math.round(laterAccuracy)}%.`,
        }],
        confidence: later.length >= 3 ? 'high' : 'medium',
      });
    }
  }

  const revisionRecommendations: RevisionRecommendation[] = emergingKnowledgeGaps.map((concept) => ({
    conceptId: concept.conceptId,
    name: concept.name,
    priority: weakConcepts.some((weak) => weak.conceptId === concept.conceptId) ? 'high' : 'medium',
    reason: concept.status === 'declining'
      ? 'Recent accuracy is lower than historical accuracy.'
      : concept.status === 'inconsistent'
        ? 'Performance is inconsistent across attempts.'
        : 'Multiple observations indicate the concept needs review.',
    confidence: concept.confidence,
  }));
  for (const concept of strongConcepts) {
    if (!revisionRecommendations.some((item) => item.conceptId === concept.conceptId)) {
      revisionRecommendations.push({
        conceptId: concept.conceptId,
        name: concept.name,
        priority: 'low',
        reason: 'Maintained strong performance may benefit from delayed verification.',
        confidence: concept.confidence,
      });
    }
  }

  const interventions: TeachingIntervention[] = [];
  for (const concept of emergingKnowledgeGaps) {
    const repeated = profile.behaviour.repeatedMistakes.some((item) => item.conceptId === concept.conceptId);
    interventions.push({
      kind: repeated ? 'reteach_alternative' : concept.status === 'declining' ? 'retrieval_practice' : 'teach_foundation',
      conceptId: concept.conceptId,
      reason: repeated
        ? 'Repeated evidence suggests the same concept needs a different explanation or smaller steps.'
        : 'Recent results are weaker than historical performance and need verification.',
      priority: weakConcepts.some((weak) => weak.conceptId === concept.conceptId) ? 'high' : 'medium',
    });
  }
  for (const option of profile.behaviour.frequentlySelectedIncorrectOptions) {
    if (option.count >= 3) {
      interventions.push({
        kind: 'reteach_alternative',
        conceptId: option.conceptId,
        reason: `The same incorrect option was selected ${option.count} times.`,
        priority: 'high',
      });
    }
  }
  for (const [conceptId, memoryCount] of repeatedMemoryCountByConcept.entries()) {
    if (memoryCount < 2) continue;
    if (!interventions.some((item) => item.kind === 'reteach_alternative' && item.conceptId === conceptId)) {
      interventions.push({
        kind: 'reteach_alternative',
        conceptId,
        reason: `Multiple incorrect-answer memories were recorded for this concept across ${memoryCount} stored items.`,
        priority: memoryCount >= 3 ? 'high' : 'medium',
      });
    }
  }
  if (profile.behaviour.correctStreak >= 3 && strongConcepts.length > 0) {
    interventions.push({
      kind: 'maintain_challenge',
      conceptId: strongConcepts[0].conceptId,
      reason: 'Multiple strong observations support a cautious increase in challenge.',
      priority: 'medium',
    });
  }
  const hintUsage = profile.behaviour.hintUsage;
  if (hintUsage.dataAvailable && hintUsage.hintDependency !== null && hintUsage.hintDependency >= 60) {
    interventions.push({
      kind: 'reduce_hints',
      conceptId: null,
      reason: 'Recent hint-assisted answers often remained incorrect; use guided retrieval before offering more hints.',
      priority: 'high',
    });
  }
  for (const feedback of (profile.behaviour.learningFeedback || []).slice(0, 10)) {
    if (feedback.type === 'TOO_HARD' || feedback.type === 'CONFUSED') {
      interventions.push({
        kind: 'teach_foundation',
        conceptId: feedback.conceptId,
        reason: feedback.type === 'TOO_HARD'
          ? 'The student reported the current work as too difficult.'
          : 'The student reported confusion and needs a simpler alternative explanation.',
        priority: 'high',
      });
    } else if (feedback.type === 'TOO_EASY') {
      interventions.push({
        kind: 'maintain_challenge',
        conceptId: feedback.conceptId,
        reason: 'The student reported that the material was too easy.',
        priority: 'medium',
      });
    } else if (feedback.type === 'TIRED' || feedback.type === 'NEED_BREAK') {
      interventions.push({
        kind: 'verify_understanding',
        conceptId: feedback.conceptId,
        reason: 'The student explicitly requested less intensity or a break.',
        priority: 'medium',
      });
    }
  }

  const isolatedMistakes = profile.academic.overall.attempts > 0 &&
    profile.academic.overall.attempts - profile.academic.overall.correct === 1 &&
    profile.behaviour.repeatedMistakes.length === 0 &&
    profile.academic.overall.accuracy !== null &&
    profile.academic.overall.accuracy >= 80;
  if (isolatedMistakes) {
    const latestConcept = profile.academic.concepts[0];
    interventions.push({
      kind: 'isolated_error_review',
      conceptId: latestConcept?.conceptId || null,
      reason: 'One recent error did not establish a recurring knowledge gap.',
      priority: 'low',
    });
  }
  if (profile.academic.overall.attempts === 0) {
    interventions.push({
      kind: 'verify_understanding',
      conceptId: null,
      reason: 'No attempts are available; begin with observable evidence rather than a mastery conclusion.',
      priority: 'medium',
    });
  }

  const evidence: DiagnosticEvidence[] = [{
    source: 'attempt_history',
    message: profile.academic.overall.attempts > 0
      ? `${profile.academic.overall.attempts} total attempts with ${profile.academic.overall.accuracy}% accuracy.`
      : 'No historical attempts are available.',
  }];
  if (profile.academic.overall.attempts >= 6 && profile.academic.overall.accuracy !== null && profile.academic.overall.accuracy >= 80) {
    return assembleDiagnostic('strong');
  }
  if (profile.academic.overall.attempts === 0) return assembleDiagnostic('insufficient_data');
  if (weakConcepts.length > 0 || emergingKnowledgeGaps.length > 0) return assembleDiagnostic('developing');
  return assembleDiagnostic(profile.academic.overall.attempts >= 3 && profile.academic.overall.accuracy !== null && profile.academic.overall.accuracy >= 70 ? 'stable' : 'mixed');

  function assembleDiagnostic(overallStatus: OverallLearningStatus): DiagnosticResult {
    return {
      overallStatus,
      subjectWiseStatus,
      conceptWiseMastery,
      weakConcepts,
      strongConcepts,
      repeatedMistakes,
      emergingKnowledgeGaps,
      improvementPatterns,
      revisionRecommendations,
      recommendedTeachingInterventions: interventions,
      confidence: confidenceFromAttempts(profile.academic.overall.attempts),
      evidence,
    };
  }
}
