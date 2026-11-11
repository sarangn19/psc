const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const { getStudentLearningProfile } = require('./dist/lib/studentLearningProfile');
const { diagnoseStudent } = require('./dist/lib/diagnosticEngine');
const { createAdaptiveLearningPlan } = require('./dist/lib/adaptiveLearningPlanner');
(async () => {
  const userId = 'cmtsghj8q0001qkyqv7yn37th';
  const session = await p.adaptiveSession.findFirst({ where: { userId }, orderBy: { id: 'desc' } });
  console.log('session', session.id, 'focus', session.focusConceptId);
  const seenItems = await p.adaptiveItem.findMany({ where: { sessionId: session.id }, select: { questionId: true } });
  const seenIds = seenItems.map(i => i.questionId);
  const recentAttempts = await p.questionAttempt.findMany({ where: { userId }, select: { questionId: true }, orderBy: { id: 'desc' }, take: 5 });
  const recentlyAttemptedIds = [...new Set(recentAttempts.map(a => a.questionId))];
  const excludedIds = [...new Set([...seenIds, ...recentlyAttemptedIds])];
  const selectedExams = await p.userExam.findMany({ where: { userId }, select: { examId: true } });
  const selectedExamIds = selectedExams.map(e => e.examId);
  console.log('seenIds', seenIds.length, 'recentlyAttempted', recentlyAttemptedIds.length, 'excluded', excludedIds.length);
  console.log('selectedExamIds', selectedExamIds);
  const profile = await getStudentLearningProfile(userId, session.id);
  const diagnostics = diagnoseStudent(profile);
  const availabilityRows = await p.question.findMany({
    where: {
      isActive: true,
      conceptId: { not: null },
      ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
      ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
    },
    select: { conceptId: true, difficulty: true, chapter: { select: { subject: { select: { id: true, examId: true } } } } },
  });
  console.log('availabilityRows', availabilityRows.length);
  const availabilityMap = new Map();
  for (const row of availabilityRows) {
    if (row.conceptId === null) continue;
    const existing = availabilityMap.get(row.conceptId) || { conceptId: row.conceptId, questionCount: 0, difficultyCounts: {}, examIds: [], subjectIds: [] };
    existing.questionCount += 1;
    existing.difficultyCounts[row.difficulty] = (existing.difficultyCounts[row.difficulty] || 0) + 1;
    existing.examIds = [...new Set([...existing.examIds, row.chapter.subject.examId])];
    existing.subjectIds = [...new Set([...existing.subjectIds, row.chapter.subject.id])];
    availabilityMap.set(row.conceptId, existing);
  }
  console.log('availabilityMap size', availabilityMap.size);
  const plan = createAdaptiveLearningPlan({
    profile,
    diagnostics,
    availableConcepts: [...availabilityMap.values()],
    selectedExamIds,
    currentLearningFocusId: session.focusConceptId,
  });
  console.log('plan selectedAction', plan.selectedAction);
  console.log('plan selectedConceptId', plan.selectedConceptId);
  console.log('plan selectedDifficulty', plan.selectedDifficulty);
  console.log('constraints', plan.availableQuestionConstraints);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
