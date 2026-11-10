import prisma from './prisma';

export interface PerformanceDatum {
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface ConceptPerformance extends PerformanceDatum {
  conceptId: number;
  name: string;
  recent20: PerformanceDatum;
  historicalBeforeRecent20: PerformanceDatum;
  lastSuccessfulAttemptAt: Date | null;
  lastIncorrectAttemptAt: Date | null;
}

export interface StudentLearningProfile {
  academic: {
    overall: PerformanceDatum;
    recent20: PerformanceDatum;
    historical: PerformanceDatum;
    subjects: Array<PerformanceDatum & { subjectId: string; name: string }>;
    chapters: Array<PerformanceDatum & { chapterId: string; name: string }>;
    concepts: ConceptPerformance[];
    strongConceptIds: number[];
    weakConceptIds: number[];
    unpractisedConceptIds: number[];
  };
  behaviour: {
    averageResponseTimeMs: number | null;
    responseTimeSampleSize: number;
    correctStreak: number;
    incorrectStreak: number;
    hintUsage: {
      dataAvailable: boolean;
      totalHints: number | null;
      hintDependency: number | null;
    };
    repeatedMistakes: Array<{
      questionId: string;
      conceptId: number | null;
      incorrectAttempts: number;
    }>;
    frequentlySelectedIncorrectOptions: Array<{
      conceptId: number | null;
      selectedOption: number;
      count: number;
    }>;
    learningFeedback?: Array<{
      type: string;
      conceptId: number | null;
      message: string | null;
      createdAt: Date;
    }>;
    persistentMemory?: Array<{
      type: string;
      conceptId: number | null;
      key: string;
      details: unknown;
      occurredAt: Date;
    }>;
    revisionSchedule?: Array<{
      conceptId: number;
      masterySnapshot: number | null;
      intervalDays: number;
      dueAt: Date;
      consecutiveSuccesses: number;
      lastResultCorrect: boolean | null;
      lastReviewedAt: Date | null;
    }>;
  };
  history: {
    lastPracticeAt: Date | null;
    lastSuccessfulAttemptAt: Date | null;
    lastIncorrectAttemptAt: Date | null;
    practisedSubjectIds: string[];
    practisedChapterIds: string[];
    previouslyMasteredConceptIds: number[];
    conceptsRequiringRevision: number[];
    sessionPerformance: Array<{
      sessionId: string;
      startedAt: Date;
      endedAt: Date | null;
      attempts: number;
      correct: number;
      accuracy: number | null;
    }>;
  };
  currentState: {
    adaptiveSessionId: string | null;
    questionsCompleted: number;
    correctAnswers: number;
    sessionDurationMs: number | null;
    recentAccuracy: number | null;
    currentLearningFocusId: number | null;
    studentReportedDifficulty: string | null;
    studentReportedFatigue: string | null;
  };
  data: {
    attemptCount: number;
    conceptStatisticCount: number;
    sessionCount: number;
    selectedExamCount: number;
  };
}

export interface ProfileAttemptInput {
  questionId: string;
  sessionId: string | null;
  selectedOption: number;
  isCorrect: boolean;
  timeTaken: number;
  createdAt: Date;
  question: {
    conceptId: number | null;
    chapterId: string;
    chapter: {
      id: string;
      name: string;
      subject: {
        id: string;
        name: string;
      };
    };
    concept: { id: number; nameEnglish: string } | null;
  };
}

export interface ProfileConceptStatInput {
  conceptId: number | null;
  chapterId: string | null;
  total: number;
  correct: number;
}

function performance(attempts: ProfileAttemptInput[]): PerformanceDatum {
  const count = attempts.length;
  return {
    attempts: count,
    correct: attempts.filter((attempt) => attempt.isCorrect).length,
    accuracy: count > 0 ? Math.round((attempts.filter((attempt) => attempt.isCorrect).length / count) * 100) : null,
  };
}

function groupAccuracy<T>(
  attempts: ProfileAttemptInput[],
  key: (attempt: ProfileAttemptInput) => T | null,
  label: (attempt: ProfileAttemptInput) => string,
): Array<PerformanceDatum & { key: T; name: string }> {
  const groups = new Map<T, ProfileAttemptInput[]>();
  for (const attempt of attempts) {
    const groupKey = key(attempt);
    if (groupKey === null) continue;
    const group = groups.get(groupKey) || [];
    group.push(attempt);
    groups.set(groupKey, group);
  }
  return [...groups.entries()].map(([groupKey, group]) => ({
    key: groupKey,
    name: label(group[0]),
    ...performance(group),
  }));
}

export function deriveStudentLearningProfile(input: {
  attempts: ProfileAttemptInput[];
  conceptStats: ProfileConceptStatInput[];
  nodeNames: Map<number, string>;
  chapterNames: Map<string, string>;
  sessions: Array<{ id: string; startedAt: Date; endedAt: Date | null; totalQ: number; correctQ: number; focusConceptId: number | null }>;
  selectedExamIds: string[];
  unpractisedConceptIds?: number[];
  currentSessionId?: string | null;
  now?: Date;
  hints?: Array<{ hintCount: number; answeredCorrect: boolean | null }>;
  learningFeedback?: Array<{ type: string; conceptId: number | null; message: string | null; createdAt: Date }>;
  persistentMemory?: Array<{ type: string; conceptId: number | null; key: string; details: unknown; occurredAt: Date }>;
  revisionSchedule?: Array<{ conceptId: number; masterySnapshot: number | null; intervalDays: number; dueAt: Date; consecutiveSuccesses: number; lastResultCorrect: boolean | null; lastReviewedAt: Date | null }>;
}): StudentLearningProfile {
  const now = input.now || new Date();
  const chronological = [...input.attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const recent20 = [...chronological].slice(-20);
  const validResponseTimes = chronological
    .map((attempt) => Number(attempt.timeTaken))
    .filter((value) => Number.isFinite(value) && value > 0);

  let correctStreak = 0;
  let incorrectStreak = 0;
  for (let index = chronological.length - 1; index >= 0; index--) {
    if (chronological[index].isCorrect) {
      if (incorrectStreak === 0) correctStreak++;
      else break;
    } else {
      if (correctStreak === 0) incorrectStreak++;
      else break;
    }
  }

  const wrongAttempts = chronological.filter((attempt) => !attempt.isCorrect);
  const repeatedByQuestion = new Map<string, ProfileAttemptInput[]>();
  for (const attempt of wrongAttempts) {
    const items = repeatedByQuestion.get(attempt.questionId) || [];
    items.push(attempt);
    repeatedByQuestion.set(attempt.questionId, items);
  }
  const repeatedMistakes = [...repeatedByQuestion.entries()]
    .filter(([, attempts]) => attempts.length >= 2)
    .map(([questionId, attempts]) => ({
      questionId,
      conceptId: attempts[0].question.conceptId,
      incorrectAttempts: attempts.length,
    }));

  const incorrectOptionCounts = new Map<string, { conceptId: number | null; selectedOption: number; count: number }>();
  for (const attempt of wrongAttempts) {
    const key = `${attempt.question.conceptId ?? 'chapter'}:${attempt.selectedOption}`;
    const existing = incorrectOptionCounts.get(key);
    incorrectOptionCounts.set(key, {
      conceptId: attempt.question.conceptId,
      selectedOption: attempt.selectedOption,
      count: (existing?.count || 0) + 1,
    });
  }
  const frequentlySelectedIncorrectOptions = [...incorrectOptionCounts.values()]
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const conceptAttempts = new Map<number, ProfileAttemptInput[]>();
  for (const attempt of chronological) {
    if (attempt.question.conceptId === null) continue;
    const items = conceptAttempts.get(attempt.question.conceptId) || [];
    items.push(attempt);
    conceptAttempts.set(attempt.question.conceptId, items);
  }

  const concepts: ConceptPerformance[] = [...conceptAttempts.entries()].map(([conceptId, attempts]) => {
    const recentCount = attempts.length <= 20 ? Math.ceil(attempts.length / 2) : 20;
    const historicalAttempts = [...attempts].slice(0, Math.max(0, attempts.length - recentCount));
    return {
      conceptId,
      name: attempts[0].question.concept?.nameEnglish || input.nodeNames.get(conceptId) || `Concept ${conceptId}`,
      ...performance(attempts),
      recent20: performance([...attempts].slice(-recentCount)),
      historicalBeforeRecent20: performance(historicalAttempts),
      lastSuccessfulAttemptAt: [...attempts].reverse().find((attempt) => attempt.isCorrect)?.createdAt || null,
      lastIncorrectAttemptAt: [...attempts].reverse().find((attempt) => !attempt.isCorrect)?.createdAt || null,
    };
  });
  for (const stat of input.conceptStats) {
    if (stat.conceptId === null) continue;
    if (conceptAttempts.has(stat.conceptId)) continue;
    concepts.push({
      conceptId: stat.conceptId,
      name: input.nodeNames.get(stat.conceptId) || `Concept ${stat.conceptId}`,
      attempts: stat.total,
      correct: stat.correct,
      accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null,
      recent20: { attempts: 0, correct: 0, accuracy: null },
      historicalBeforeRecent20: { attempts: 0, correct: 0, accuracy: null },
      lastSuccessfulAttemptAt: null,
      lastIncorrectAttemptAt: null,
    });
  }
  concepts.sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
  const strongConceptIds = concepts.filter((item) => item.attempts >= 3 && (item.accuracy ?? 0) >= 80).map((item) => item.conceptId);
  const weakConceptIds = concepts.filter((item) => item.attempts >= 3 && (item.accuracy ?? 100) < 60).map((item) => item.conceptId);
  const unpractisedConceptIds = input.unpractisedConceptIds || [];
  const hints = input.hints || [];
  const hintsWithAnswer = hints.filter((hint) => hint.answeredCorrect !== null);
  const totalHints = hints.reduce((sum, hint) => sum + Math.max(1, hint.hintCount), 0);
  const hintDependency = hintsWithAnswer.length
    ? Math.round((hintsWithAnswer.filter((hint) => !hint.answeredCorrect).length / hintsWithAnswer.length) * 100)
    : null;
  const learningFeedback = input.learningFeedback || [];
  const latestDifficultyFeedback = learningFeedback
    .filter((item) => item.type === 'TOO_HARD' || item.type === 'TOO_EASY' || item.type === 'CONFUSED')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
  const latestFatigueFeedback = learningFeedback
    .filter((item) => item.type === 'TIRED' || item.type === 'NEED_BREAK')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
  const dueRevisionConceptIds = (input.revisionSchedule || [])
    .filter((revision) => revision.dueAt.getTime() <= now.getTime())
    .map((revision) => revision.conceptId);

  const subjects = groupAccuracy(
    chronological,
    (attempt) => attempt.question.chapter.subject.id,
    (attempt) => attempt.question.chapter.subject.name,
  ).map((item) => ({ subjectId: item.key, name: item.name, attempts: item.attempts, correct: item.correct, accuracy: item.accuracy }));
  const chapters = groupAccuracy(
    chronological,
    (attempt) => attempt.question.chapterId,
    (attempt) => attempt.question.chapter.name,
  ).map((item) => ({ chapterId: item.key, name: item.name, attempts: item.attempts, correct: item.correct, accuracy: item.accuracy }));

  const lastSuccessful = [...chronological].reverse().find((attempt) => attempt.isCorrect);
  const lastIncorrect = [...chronological].reverse().find((attempt) => !attempt.isCorrect);
  const practisedSubjectIds = [...new Set(subjects.map((item) => item.subjectId))];
  const practisedChapterIds = [...new Set(chapters.map((item) => item.chapterId))];

  const latestSession = input.sessions
    .slice()
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] || null;
  const currentSession = input.currentSessionId
    ? input.sessions.find((session) => session.id === input.currentSessionId) || latestSession
    : latestSession;
  const sessionAttempts = currentSession
    ? chronological.filter((attempt) => attempt.sessionId === currentSession.id)
    : [];
  const sessionPerformance = input.sessions
    .slice()
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((session) => {
      const sessionItems = chronological.filter((attempt) => attempt.sessionId === session.id);
      const count = session.totalQ || sessionItems.length;
      const correct = session.correctQ || sessionItems.filter((attempt) => attempt.isCorrect).length;
      return {
        sessionId: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        attempts: count,
        correct,
        accuracy: count > 0 ? Math.round((correct / count) * 100) : null,
      };
    });

  return {
    academic: {
      overall: performance(chronological),
      recent20: performance(recent20),
      historical: performance(chronological),
      subjects,
      chapters,
      concepts,
      strongConceptIds,
      weakConceptIds,
      unpractisedConceptIds,
    },
    behaviour: {
      averageResponseTimeMs: validResponseTimes.length
        ? Math.round(validResponseTimes.reduce((sum, value) => sum + value, 0) / validResponseTimes.length)
        : null,
      responseTimeSampleSize: validResponseTimes.length,
      correctStreak,
      incorrectStreak,
      hintUsage: { dataAvailable: hints.length > 0, totalHints: hints.length > 0 ? totalHints : null, hintDependency },
      repeatedMistakes,
      frequentlySelectedIncorrectOptions,
      learningFeedback: input.learningFeedback || [],
      persistentMemory: input.persistentMemory || [],
      revisionSchedule: input.revisionSchedule || [],
    },
    history: {
      lastPracticeAt: chronological.at(-1)?.createdAt || null,
      lastSuccessfulAttemptAt: lastSuccessful?.createdAt || null,
      lastIncorrectAttemptAt: lastIncorrect?.createdAt || null,
      practisedSubjectIds,
      practisedChapterIds,
      previouslyMasteredConceptIds: strongConceptIds,
      conceptsRequiringRevision: [...new Set(dueRevisionConceptIds)],
      sessionPerformance,
    },
    currentState: {
      adaptiveSessionId: currentSession?.id || null,
      questionsCompleted: currentSession?.totalQ ?? sessionAttempts.length,
      correctAnswers: currentSession?.correctQ ?? sessionAttempts.filter((attempt) => attempt.isCorrect).length,
      sessionDurationMs: currentSession ? Math.max(0, (currentSession.endedAt || now).getTime() - currentSession.startedAt.getTime()) : null,
      recentAccuracy: sessionAttempts.length > 0
        ? Math.round((sessionAttempts.filter((attempt) => attempt.isCorrect).length / sessionAttempts.length) * 100)
        : currentSession?.totalQ
          ? Math.round((currentSession.correctQ / currentSession.totalQ) * 100)
          : null,
      currentLearningFocusId: currentSession?.focusConceptId || null,
      studentReportedDifficulty: latestDifficultyFeedback?.type || null,
      studentReportedFatigue: latestFatigueFeedback?.type || null,
    },
    data: {
      attemptCount: chronological.length,
      conceptStatisticCount: input.conceptStats.length,
      sessionCount: input.sessions.length,
      selectedExamCount: input.selectedExamIds.length,
    },
  };
}

export async function getStudentLearningProfile(userId: string, currentSessionId?: string | null, now = new Date()) {
  const attemptsRaw = await prisma.questionAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      questionId: true,
      sessionId: true,
      selectedOption: true,
      isCorrect: true,
      timeTaken: true,
      createdAt: true,
      question: {
        select: {
          conceptId: true,
          chapterId: true,
          chapter: {
            select: {
              id: true,
              name: true,
              subject: { select: { id: true, name: true } },
            },
          },
          concept: { select: { id: true, nameEnglish: true } },
        },
      },
    },
  });

  const [conceptStats, conceptIds, chapterIds, sessions, selectedExams, hints, learningFeedback, persistentMemory, revisionSchedule] = await Promise.all([
    prisma.userConceptStat.findMany({
      where: { userId },
      select: { conceptId: true, chapterId: true, total: true, correct: true },
    }),
    prisma.userConceptStat.findMany({ where: { userId, conceptId: { not: null } }, select: { conceptId: true } }),
    prisma.userConceptStat.findMany({ where: { userId, chapterId: { not: null } }, select: { chapterId: true } }),
    prisma.adaptiveSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: { id: true, startedAt: true, endedAt: true, totalQ: true, correctQ: true, focusConceptId: true },
    }),
    prisma.userExam.findMany({ where: { userId }, select: { examId: true } }),
    prisma.learningHint.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 500,
      select: { hintCount: true, answeredCorrect: true, answeredAt: true, requestedAt: true, conceptId: true },
    }),
    prisma.learningFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { type: true, conceptId: true, message: true, createdAt: true },
    }),
    prisma.studentLearningMemory.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
      select: { type: true, conceptId: true, key: true, details: true, occurredAt: true },
    }),
    prisma.conceptRevision.findMany({
      where: { userId },
      orderBy: { dueAt: 'asc' },
      select: { conceptId: true, masterySnapshot: true, intervalDays: true, dueAt: true, consecutiveSuccesses: true, lastResultCorrect: true, lastReviewedAt: true },
    }),
  ]);

  const nodeIds = [...new Set([
    ...conceptIds.map((item) => item.conceptId).filter((id): id is number => id !== null),
    ...attemptsRaw.map((attempt) => attempt.question.conceptId).filter((id): id is number => id !== null),
  ])];
  const chapterIdSet = [...new Set([
    ...chapterIds.map((item) => item.chapterId).filter((id): id is string => id !== null),
    ...attemptsRaw.map((attempt) => attempt.question.chapterId),
  ])];
  const [nodes, chapters] = await Promise.all([
    nodeIds.length ? prisma.taxonomyNode.findMany({ where: { id: { in: nodeIds } }, select: { id: true, nameEnglish: true } }) : [],
    chapterIdSet.length ? prisma.chapter.findMany({ where: { id: { in: chapterIdSet } }, select: { id: true, name: true } }) : [],
  ]);

  const attempts: ProfileAttemptInput[] = attemptsRaw.map((attempt) => ({
    questionId: attempt.questionId,
    sessionId: attempt.sessionId,
    selectedOption: attempt.selectedOption,
    isCorrect: attempt.isCorrect,
    timeTaken: attempt.timeTaken,
    createdAt: attempt.createdAt,
    question: attempt.question,
  }));

  const selectedExamIds = selectedExams.map((item) => item.examId);
  const { getEligibleLearnedChapterIds } = await import('./learningEligibility');
  const learnedChapterIds = await getEligibleLearnedChapterIds(userId);
  const learnedFilter = learnedChapterIds.length ? { chapterId: { in: learnedChapterIds } } : { chapterId: '__none__' };
  const eligibleQuestions = selectedExamIds.length
    ? await prisma.question.findMany({
        where: {
          isActive: true,
          conceptId: { not: null },
          chapter: { subject: { examId: { in: selectedExamIds } } },
          ...learnedFilter,
        },
        select: { conceptId: true },
        distinct: ['conceptId'],
      })
    : await prisma.question.findMany({
        where: { isActive: true, conceptId: { not: null }, ...learnedFilter },
        select: { conceptId: true },
        distinct: ['conceptId'],
      });
  const practisedConceptIds = new Set([
    ...attempts.map((attempt) => attempt.question.conceptId).filter((id): id is number => id !== null),
    ...conceptStats.map((stat) => stat.conceptId).filter((id): id is number => id !== null),
  ]);
  const unpractisedConceptIds = [...new Set(
    eligibleQuestions.map((question) => question.conceptId).filter((id): id is number => id !== null && !practisedConceptIds.has(id)),
  )];

  return deriveStudentLearningProfile({
    attempts,
    conceptStats,
    nodeNames: new Map(nodes.map((node) => [node.id, node.nameEnglish])),
    chapterNames: new Map(chapters.map((chapter) => [chapter.id, chapter.name])),
    sessions,
    selectedExamIds,
    unpractisedConceptIds,
    currentSessionId,
    now,
    hints,
    learningFeedback,
    persistentMemory,
    revisionSchedule,
  });
}
