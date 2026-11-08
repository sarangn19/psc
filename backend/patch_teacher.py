p = r"C:\Users\saran\Documents\psc app\backend\src\routes\teacher.ts"
s = open(p, encoding='utf-8').read()

old = '''  const plan = createAdaptiveLearningPlan({
    profile,
    diagnostics,
    availableConcepts: [...availabilityMap.values()],
    selectedExamIds,
    currentLearningFocusId: session.focusConceptId,
  });
  if (plan.selectedAction === 'no_available_question' || plan.selectedConceptId === null) {
    return res.json({ done: true, message: 'I\\u0027ve run out of stored questions for the current learning objective. No unrelated topic has been chosen.' });
  }
  const targetDifficulty = plan.selectedDifficulty as Difficulty;
  let candidates = await prisma.question.findMany({
    where: {
      isActive: true,
      conceptId: plan.selectedConceptId,
      ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
      ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
      difficulty: targetDifficulty,
    },
    include: { chapter: { include: { subject: true } }, concept: true },
    take: 25,
    orderBy: [{ updatedAt: 'desc' }],
  });
  if (!candidates.length) {
    candidates = await prisma.question.findMany({
      where: {
        isActive: true,
        conceptId: plan.selectedConceptId,
        ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
        ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
      },
      include: { chapter: { include: { subject: true } }, concept: true },
      take: 25,
      orderBy: [{ updatedAt: 'desc' }],
    });
  }
  candidates = candidates.filter((candidate) => validatePracticeQuestion({
    text: candidate.text,
    options: normalizeOptions(candidate.options),
    correctOption: candidate.correctOption,
  }).valid);
  const question = candidates.find((candidate) => validatePracticeQuestion({
    text: candidate.text,
    options: normalizeOptions(candidate.options),
    correctOption: candidate.correctOption,
  }).valid);
  if (!question) return res.json({ done: true, message: 'Nicely done! I\\u0027ve run out of stored questions for this topic. We can review another topic or come back later.' });
'''

new = '''  const availableConcepts = [...availabilityMap.values()];
  let plan = createAdaptiveLearningPlan({
    profile,
    diagnostics,
    availableConcepts,
    selectedExamIds,
    currentLearningFocusId: session.focusConceptId,
  });
  if (plan.selectedAction === 'no_available_question' || plan.selectedConceptId === null) {
    return res.json({ done: true, message: 'I\\u0027ve run out of stored questions for the current learning objective. No unrelated topic has been chosen.' });
  }
  const failedConcepts = new Set<number>();
  let question: any = null;
  let targetDifficulty: Difficulty = plan.selectedDifficulty as Difficulty;
  while (!question && failedConcepts.size < 5) {
    if (failedConcepts.has(plan.selectedConceptId!)) {
      const filtered = availableConcepts.filter((concept) => !failedConcepts.has(concept.conceptId));
      if (!filtered.length) break;
      plan = createAdaptiveLearningPlan({
        profile,
        diagnostics,
        availableConcepts: filtered,
        selectedExamIds,
        currentLearningFocusId: session.focusConceptId,
      });
      if (plan.selectedAction === 'no_available_question' || plan.selectedConceptId === null) break;
    }
    targetDifficulty = plan.selectedDifficulty as Difficulty;
    let candidates = await prisma.question.findMany({
      where: {
        isActive: true,
        conceptId: plan.selectedConceptId!,
        ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
        ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
        difficulty: targetDifficulty,
      },
      include: { chapter: { include: { subject: true } }, concept: true },
      take: 25,
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (!candidates.length) {
      candidates = await prisma.question.findMany({
        where: {
          isActive: true,
          conceptId: plan.selectedConceptId!,
          ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
          ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
        },
        include: { chapter: { include: { subject: true } }, concept: true },
        take: 25,
        orderBy: [{ updatedAt: 'desc' }],
      });
    }
    candidates = candidates.filter((candidate) => validatePracticeQuestion({
      text: candidate.text,
      options: normalizeOptions(candidate.options),
      correctOption: candidate.correctOption,
    }).valid);
    question = candidates.find((candidate) => validatePracticeQuestion({
      text: candidate.text,
      options: normalizeOptions(candidate.options),
      correctOption: candidate.correctOption,
    }).valid) || null;
    if (!question) {
      failedConcepts.add(plan.selectedConceptId!);
    }
  }
  if (!question) {
    return res.json({ done: true, message: 'Nicely done! I\\u0027ve run out of stored questions for this topic. We can review another topic or come back later.' });
  }
'''

assert old in s, "old block not found"
s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
print("patched")
EOF
