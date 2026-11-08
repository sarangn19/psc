const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const { getStudentLearningProfile } = require('./dist/lib/studentLearningProfile');
const { diagnoseStudent } = require('./dist/lib/diagnosticEngine');
const { createAdaptiveLearningPlan } = require('./dist/lib/adaptiveLearningPlanner');
const { normalizeOptions } = require('./dist/lib/options');
const { validatePracticeQuestion } = require('./dist/lib/teacher');
(async () => {
  const sessions = await p.adaptiveSession.findMany({ take: 20, orderBy: { id: 'desc' } });
  for (const session of sessions) {
    const userId = session.userId;
    const seenItems = await p.adaptiveItem.findMany({ where: { sessionId: session.id }, select: { questionId: true } });
    const seenIds = seenItems.map(i => i.questionId);
    const recentAttempts = await p.questionAttempt.findMany({ where: { userId }, select: { questionId: true }, orderBy: { id: 'desc' }, take: 5 });
    const recentlyAttemptedIds = [...new Set(recentAttempts.map(a => a.questionId))];
    const excludedIds = [...new Set([...seenIds, ...recentlyAttemptedIds])];
    const selectedExams = await p.userExam.findMany({ where: { userId }, select: { examId: true } });
    const selectedExamIds = selectedExams.map(e => e.examId);
    if (!selectedExamIds.length) { console.log(session.id, 'no exams'); continue; }
    const profile = await getStudentLearningProfile(userId, session.id);
    const diagnostics = diagnoseStudent(profile);
    const availabilityRows = await p.question.findMany({
      where: { isActive: true, conceptId: { not: null }, ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}), ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}) },
      select: { conceptId: true, difficulty: true, chapter: { select: { subject: { select: { id: true, examId: true } } } } },
    });
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
    const plan = createAdaptiveLearningPlan({ profile, diagnostics, availableConcepts: [...availabilityMap.values()], selectedExamIds, currentLearningFocusId: session.focusConceptId });
    let candCount = 0, validCount = 0;
    if (plan.selectedConceptId !== null) {
      const cands = await p.question.findMany({ where: { isActive: true, conceptId: plan.selectedConceptId, ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}), ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}), difficulty: plan.selectedDifficulty }, take: 25 });
      candCount = cands.length;
      for (const q of cands) { const v = validatePracticeQuestion({ text: q.text, options: normalizeOptions(q.options), correctOption: q.correctOption }); if (v.valid) validCount++; }
      if (candCount === 0) {
        const cands2 = await p.question.findMany({ where: { isActive: true, conceptId: plan.selectedConceptId, ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}), ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}) }, take: 25 });
        candCount = cands2.length;
        for (const q of cands2) { const v = validatePracticeQuestion({ text: q.text, options: normalizeOptions(q.options), correctOption: q.correctOption }); if (v.valid) validCount++; }
      }
    }
    console.log(session.id, 'action', plan.selectedAction, 'concept', plan.selectedConceptId, 'diff', plan.selectedDifficulty, 'avail', availabilityMap.size, 'cand', candCount, 'valid', validCount, 'excluded', excludedIds.length, 'seen', seenIds.length);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
