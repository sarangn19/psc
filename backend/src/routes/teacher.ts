import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { buildDayPlan, nextDifficulty, optionName, validatePracticeQuestion } from '../lib/teacher';
import { Difficulty, Prisma } from '@prisma/client';
import { normalizeOptions } from '../lib/options';
import { getStudentLearningProfile } from '../lib/studentLearningProfile';
import { diagnoseStudent } from '../lib/diagnosticEngine';
import { createAdaptiveLearningPlan, AvailableConcept } from '../lib/adaptiveLearningPlanner';
import { buildTeachingContext, serializeTeachingContext, TeachingInteraction } from '../lib/teachingContext';
import { AnswerSubmissionError, submitAnswerAtomically } from '../lib/answerSubmission';
import { composeAnswerFeedback, composeQuestionIntroduction, composeWelcome } from '../lib/teachingResponseComposer';
import { classifyIntent, composeConversationResponse } from '../lib/conversationIntent';

const router = Router();

interface RateWindow { count: number; resetAt: number }
const rateWindows = new Map<string, RateWindow>();
const nextSessionLocks = new Map<string, Promise<void>>();

router.get('/bootstrap', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const [selected, weakStats] = await Promise.all([
    prisma.userExam.findMany({
      where: { userId },
      include: { exam: { include: { subjects: { include: { chapters: true }, orderBy: { order: 'asc' } } } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.userConceptStat.findMany({
      where: { userId, conceptId: { not: null } },
      select: { conceptId: true, total: true, correct: true },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    }),
  ]);
  const weakIds = weakStats.filter((s) => s.total > 0 && s.correct / s.total < 0.7).map((s) => s.conceptId!).filter(Boolean);
  const weakNodes = weakIds.length ? await prisma.taxonomyNode.findMany({ where: { id: { in: weakIds } }, select: { id: true, nameEnglish: true } }) : [];
  const weak = weakNodes.map((node) => {
    const stat = weakStats.find((s) => s.conceptId === node.id)!;
    return { id: node.id, name: node.nameEnglish, accuracy: Math.round((stat.correct / stat.total) * 100) };
  });
  return res.json({
    exams: selected.map((item) => item.exam),
    weak,
    model: { configured: Boolean(process.env.AI_API_KEY && process.env.AI_API_URL), requestsPerMinute: Number(process.env.AI_RPM || 10) },
  });
});

router.get('/plan', authenticate, async (req: AuthRequest, res) => {
  const examId = String(req.query.examId || '');
  const targetDate = String(req.query.targetDate || '');
  if (!examId || !targetDate) return res.status(400).json({ message: 'examId and targetDate are required' });
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { subjects: { include: { chapters: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } },
  });
  if (!exam) return res.status(404).json({ message: 'Exam not found' });
  const chapters = exam.subjects.flatMap((subject) => subject.chapters.map((chapter) => ({ id: chapter.id, name: `${subject.name}: ${chapter.name}` })));
  const weakStats = await prisma.userConceptStat.findMany({ where: { userId: req.user!.id, conceptId: { not: null } }, select: { conceptId: true, total: true, correct: true } });
  const weakIds = weakStats.filter((s) => s.total > 0 && s.correct / s.total < 0.7).map((s) => s.conceptId!).filter(Boolean);
  const weakNodes = weakIds.length ? await prisma.taxonomyNode.findMany({ where: { id: { in: weakIds } }, select: { nameEnglish: true } }) : [];
  return res.json({
    subjects: exam.subjects,
    plan: buildDayPlan(chapters, targetDate, weakNodes.map((n) => n.nameEnglish)),
    weakReview: weakNodes.map((n) => n.nameEnglish),
    source: chapters.length ? 'curated syllabus and question bank' : 'No syllabus content is configured',
  });
});

router.post('/hint', authenticate, async (req: AuthRequest, res) => {
  const question = await prisma.question.findUnique({
    where: { id: String(req.body?.questionId || '') },
    include: { chapter: true, concept: true },
  });
  if (!question) return res.status(404).json({ message: 'Question not found' });
  const eventKey = String(req.body?.eventKey || '').trim() || `hint:${req.user!.id}:${question.id}:${req.body?.sessionId || 'none'}:${Math.floor(Date.now() / 1000)}`;
  let sessionId = req.body?.sessionId ? String(req.body.sessionId) : null;
  if (sessionId) {
    const session = await prisma.adaptiveSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== req.user!.id) {
      return res.status(404).json({ message: 'Teacher session not found' });
    }
  } else {
    const latestSession = await prisma.adaptiveSession.findFirst({
      where: { userId: req.user!.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    sessionId = latestSession?.id || null;
  }
  await prisma.learningHint.upsert({
    where: { userId_eventKey: { userId: req.user!.id, eventKey } },
    create: {
      userId: req.user!.id,
      eventKey,
      sessionId,
      questionId: question.id,
      conceptId: question.conceptId,
      hintCount: 1,
    },
    update: { hintCount: { increment: 1 } },
  });
  const options = normalizeOptions(question.options);
  const profile = await getStudentLearningProfile(req.user!.id, null);
  const diagnostics = diagnoseStudent(profile);
  const plan = createAdaptiveLearningPlan({
    profile,
    diagnostics,
    availableConcepts: question.conceptId ? [{
      conceptId: question.conceptId,
      questionCount: 1,
      difficultyCounts: { [question.difficulty]: 1 },
    }] : [],
    selectedExamIds: [],
    currentLearningFocusId: question.conceptId,
  });
  const teachingContext = buildTeachingContext({
    profile,
    diagnostics,
    plan,
    currentConceptName: null,
    currentQuestion: { text: question.text, options, correctOption: question.correctOption, storedExplanation: question.explanation },
    studentFeedback: 'The student requested a hint.',
  });
  const result = await generateOptional(
    req.user!.id,
    [
      'You are a patient tutor. Give one or two short conversational hint sentences.',
      'Do not reveal the answer letter, answer value, or complete solution.',
      'Ground the hint in the question only; if the source or method is uncertain, say that you are not sure.',
      `Question: ${question.text}`,
      `Options: ${options.map((option, index) => `${String.fromCharCode(65 + index)}: ${option}`).join('; ')}`,
      serializeTeachingContext(teachingContext),
    ].join('\n'),
  );
  return res.status(result.status).json(result.body);
});

router.post('/feedback', authenticate, async (req: AuthRequest, res) => {
  const allowed = new Set(['TOO_HARD', 'TOO_EASY', 'CONFUSED', 'EXPLAIN_DIFFERENTLY', 'TIRED', 'NEED_BREAK']);
  const type = String(req.body?.type || '').trim();
  if (!allowed.has(type)) return res.status(400).json({ message: 'Invalid learning feedback type' });
  const eventKey = String(req.body?.eventKey || '').trim() || `feedback:${req.user!.id}:${type}:${req.body?.sessionId || 'none'}:${Date.now()}`;
  const sessionId = req.body?.sessionId ? String(req.body.sessionId) : null;
  if (sessionId) {
    const session = await prisma.adaptiveSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== req.user!.id) {
      return res.status(404).json({ message: 'Teacher session not found' });
    }
  }
  const questionId = req.body?.questionId ? String(req.body.questionId) : null;
  let conceptId = Number.isInteger(Number(req.body?.conceptId)) ? Number(req.body.conceptId) : null;
  if (questionId) {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { conceptId: true },
    });
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (conceptId !== null && question.conceptId !== null && conceptId !== question.conceptId) {
      return res.status(400).json({ message: 'Feedback concept does not match the question' });
    }
    conceptId = question.conceptId ?? conceptId;
  }
  await prisma.learningFeedback.upsert({
    where: { userId_eventKey: { userId: req.user!.id, eventKey } },
    create: {
      userId: req.user!.id,
      eventKey,
      type: type as 'TOO_HARD' | 'TOO_EASY' | 'CONFUSED' | 'EXPLAIN_DIFFERENTLY' | 'TIRED' | 'NEED_BREAK',
      sessionId,
      questionId,
      conceptId,
      message: typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 500) : null,
    },
    update: {},
  });
  return res.json({ saved: true });
});

router.post('/conversation', authenticate, async (req: AuthRequest, res) => {
  const requestId = `conv_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const userId = req.user!.id;
  const message = String(req.body?.message || '').trim();
  console.log(JSON.stringify({ event: 'conversation_start', requestId, message: message.slice(0,200) }));
  const recentHistory = Array.isArray(req.body?.history)
    ? req.body.history.slice(-8).map((item: any) => `${item.sender === 'student' ? 'Student' : 'Teacher'}: ${String(item.text || '').slice(0, 500)}`).join('\n')
    : '';
  if (!message) return res.status(400).json({ message: 'Message is required' });
  const loweredMessage = message.toLowerCase();
  const inferredFeedback = loweredMessage.includes('too hard') || loweredMessage.includes('difficult')
    ? 'TOO_HARD'
    : loweredMessage.includes('too easy')
      ? 'TOO_EASY'
      : loweredMessage.includes('confused') || loweredMessage.includes('do not understand') || loweredMessage.includes("don't understand")
        ? 'CONFUSED'
        : loweredMessage.includes('explain differently') || loweredMessage.includes('another way')
          ? 'EXPLAIN_DIFFERENTLY'
          : loweredMessage.includes('tired')
            ? 'TIRED'
            : loweredMessage.includes('break')
              ? 'NEED_BREAK'
              : null;
  if (inferredFeedback) {
    const feedbackEventKey = `conversation:${userId}:${inferredFeedback}:${Math.floor(Date.now() / 60000)}`;
    await prisma.learningFeedback.upsert({
      where: { userId_eventKey: { userId, eventKey: feedbackEventKey } },
      create: {
        userId,
        eventKey: feedbackEventKey,
        type: inferredFeedback as 'TOO_HARD' | 'TOO_EASY' | 'CONFUSED' | 'EXPLAIN_DIFFERENTLY' | 'TIRED' | 'NEED_BREAK',
        message: message.slice(0, 500),
      },
      update: {},
    });
  }

  const [selected, profile, currentQuestion] = await Promise.all([
    prisma.userExam.findMany({
      where: { userId },
      include: { exam: { select: { name: true } } },
    }),
    getStudentLearningProfile(userId, null),
    req.body?.questionId
      ? prisma.question.findUnique({
          where: { id: String(req.body.questionId) },
          include: { chapter: { include: { subject: true } }, concept: true },
        })
      : null,
  ]);
  const examNames = selected.map((item) => item.exam.name);
  console.log(JSON.stringify({ event: 'conversation_exam', requestId, exams: examNames }));
  const selectedExamIds = selected.map((item) => item.examId);
  const diagnostics = diagnoseStudent(profile);
  const availableRows = await prisma.question.findMany({
    where: {
      isActive: true,
      conceptId: { not: null },
      ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
    },
    select: { conceptId: true, difficulty: true },
  });
  const availabilityMap = new Map<number, AvailableConcept>();
  for (const row of availableRows) {
    if (row.conceptId === null) continue;
    const existing = availabilityMap.get(row.conceptId) || { conceptId: row.conceptId, questionCount: 0, difficultyCounts: {} };
    existing.questionCount += 1;
    existing.difficultyCounts![row.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] =
      (existing.difficultyCounts![row.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] || 0) + 1;
    availabilityMap.set(row.conceptId, existing);
  }
  const plan = createAdaptiveLearningPlan({
    profile,
    diagnostics,
    availableConcepts: [...availabilityMap.values()],
    selectedExamIds,
    currentLearningFocusId: profile.currentState.currentLearningFocusId,
  });
  const teachingContext = buildTeachingContext({
    profile,
    diagnostics,
    plan,
    currentConceptName: currentQuestion?.concept?.nameEnglish || null,
    currentQuestion: currentQuestion
      ? {
          text: currentQuestion.text,
          options: normalizeOptions(currentQuestion.options),
          correctOption: currentQuestion.correctOption,
          storedExplanation: currentQuestion.explanation,
        }
      : null,
    recentInteractions: Array.isArray(req.body?.history) ? req.body.history.slice(-8).map((item: any) => ({
      sender: item.sender === 'student' ? 'student' as const : 'teacher' as const,
      text: String(item.text || '').slice(0, 500),
    })) : [],
    studentMessage: message,
    studentFeedback: message,
  });
const intent = classifyIntent(message);
  const lowerMessage = message.toLowerCase();
  const replyTo = req.body?.replyTo;
  const hasExplicitTopicCorrection = /not about the question|in general|i mean in general|forget that|change the topic|leave the question|something else|talk about something else/i.test(lowerMessage);
  const isEmotionalSupport = /stressed|tired|exhausted|sad|anxious|overwhelmed|confused|not motivated|need someone to talk/i.test(lowerMessage) && !/this question|that question|the question/i.test(lowerMessage);
  const isPerformanceQuestion = /am i improving|how am i doing|my weak|my progress|how am i performing/i.test(lowerMessage);
  const isPracticeRequest = /another question|next question|test me|practice|give me a question/i.test(lowerMessage);
  const isExamPrep = /how should i prepare|how to prepare|study plan|what should i study/i.test(lowerMessage);
  const referencesCurrentQuestion = /\b(this|that|it|the question|the problem|last step|previous|above|these|those)\b/.test(lowerMessage);
  const isFollowUp = /\b(why|how does that work|explain that again|another example|what happens if|did not understand|didn't understand)\b/.test(lowerMessage) && referencesCurrentQuestion;
  let contextMode = 'GENERAL_ACADEMIC_HELP';
  if (replyTo) contextMode = 'EXPLICIT_REPLY_FOLLOWUP';
  else if (hasExplicitTopicCorrection) contextMode = 'GENERAL_CONVERSATION';
  else if (isEmotionalSupport) contextMode = 'EMOTIONAL_SUPPORT';
  else if (isPerformanceQuestion) contextMode = 'PERFORMANCE_RESPONSE';
  else if (isPracticeRequest) contextMode = 'START_PRACTICE';
  else if (isExamPrep) contextMode = 'EXAM_PREPARATION_GUIDANCE';
  else if (isFollowUp) contextMode = 'ACTIVE_QUESTION_HELP';
  else if (referencesCurrentQuestion) contextMode = 'ACTIVE_QUESTION_HELP';
  const contextQuestion = (contextMode === 'ACTIVE_QUESTION_HELP') ? currentQuestion : null;
  const composed = composeConversationResponse(intent, message, (contextQuestion ? currentQuestion?.text : null) || null, (contextQuestion ? currentQuestion?.explanation : null) || null, (contextQuestion ? currentQuestion?.concept?.nameEnglish : null) || null);
  const replyContext = replyTo ? `Student is replying to ${replyTo.sender}: "${String(replyTo.text || '').slice(0,300)}"` : '';
  const prompt = [
    'ROLE: You are a patient, accurate tutor chatting with one student. Every reply must teach something and feel like a real person.',
    "Always answer the student's actual question directly first, then add helpful context if needed.",
    'STYLE: Use one to three short chat bubbles of meaning. Never use headings, bullet lists, raw topic labels, or stock filler. Be warm and direct.',
    'Use the student’s own words and recent turns. Never reset or restart the conversation.',
    'Choose the next step from accuracy, recent mistakes, time since review, hint use, answer speed, and what the student asks.',
    'If the student says too hard, simplify and offer one quick win. If too easy or accurate, raise difficulty gradually. If tired or the session is long, recap briefly and suggest a break.',
    'Never send the raw topic/category name. Any topic change needs one natural sentence explaining why based on performance.',
    'Stay on the same topic after a miss until understanding is shown. After a correct answer, praise something specific, then move on or raise difficulty.',
    'Facts and explanations must be verified against the supplied question and stored context. If unsure, say less and identify what cannot be confirmed.',
    'Always end with the next step: a question, a hint offer, or a short check-in.',
    `Selected exams: ${examNames.length ? examNames.join(', ') : 'not selected yet'}.`,
    contextQuestion
      ? [
          `Current question: ${contextQuestion.text}`,
          `Options: ${normalizeOptions(contextQuestion.options).map((option, index) => `${String.fromCharCode(65 + index)}: ${option}`).join('; ')}`,
          contextQuestion.explanation ? `Stored explanation: ${contextQuestion.explanation}` : 'Stored explanation unavailable.',
        ].join('\n')
      : 'There is no active practice question.',
    recentHistory ? `Recent conversation:\n${recentHistory}` : '',
    replyContext ? `Reply context: ${replyContext}` : '',
    `Student message: ${message}`,
    'If the request is for a hint, help without revealing the answer option or value. If it asks for an explanation, teach it simply. Do not claim official predictions or certainty.',
    serializeTeachingContext(teachingContext),
  ].join('\n');
  const ai = await generateOptional(userId, prompt);
  console.log(JSON.stringify({ event: 'conversation_groq', requestId, generated: !!ai.body?.generated, status: ai.status, textLength: ai.body?.text?.length ?? 0 }));
  const text = ai.body?.generated ? ai.body.text : composed;
  console.log(JSON.stringify({ event: 'conversation_final', requestId, source: ai.body?.generated ? 'groq' : 'fallback', textLength: text?.length ?? 0 }));
  return res.status(200).json({ generated: ai.body?.generated ?? false, text, unavailable: !ai.body?.generated });
});

router.post('/lesson-meta', authenticate, async (req: AuthRequest, res) => {
  const conceptId = Number(req.body?.conceptId);
  if (!Number.isInteger(conceptId)) return res.status(400).json({ message: 'conceptId is required' });
  const node = await prisma.taxonomyNode.findUnique({ where: { id: conceptId }, include: { parent: true } });
  return res.json({ name: node?.nameEnglish || 'Topic', description: node?.description || null, sourceMissing: !node?.description });
});

router.get('/session/latest', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const activities = await prisma.userActivity.findMany({
    where: { userId, type: 'ADAPTIVE_SESSION_STARTED' },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
  const sessionId = activities
    .map((activity) => (activity.metadata as any)?.teacherSessionId)
    .find((id): id is string => typeof id === 'string');
  if (!sessionId) return res.json({ session: null });

  const session = await prisma.adaptiveSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) return res.json({ session: null });
  const focusTopic = session.focusConceptId
    ? await prisma.taxonomyNode.findUnique({ where: { id: session.focusConceptId }, select: { nameEnglish: true } })
    : null;
  return res.json({
    session: {
      id: session.id,
      focusConceptId: session.focusConceptId,
      focusTopic: focusTopic?.nameEnglish || null,
      totalQ: session.totalQ,
      correctQ: session.correctQ,
      startedAt: session.startedAt,
    },
  });
});

router.post('/session/start', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const requestedConceptId = Number(req.body?.conceptId);
  let focusConceptId = Number.isInteger(requestedConceptId) ? requestedConceptId : null;

  if (!focusConceptId) {
    const selectedExams = await prisma.userExam.findMany({
      where: { userId },
      select: { examId: true },
    });
    const selectedExamIds = selectedExams.map((item) => item.examId);
    const eligibleQuestions = selectedExamIds.length
      ? await prisma.question.findMany({
          where: {
            isActive: true,
            chapter: { subject: { examId: { in: selectedExamIds } } },
            conceptId: { not: null },
          },
          select: { conceptId: true, difficulty: true },
        })
      : await prisma.question.findMany({
          where: { isActive: true, conceptId: { not: null } },
          select: { conceptId: true, difficulty: true },
        });
    const availabilityMap = new Map<number, AvailableConcept>();
    for (const row of eligibleQuestions) {
      if (row.conceptId === null) continue;
      const existing = availabilityMap.get(row.conceptId) || { conceptId: row.conceptId, questionCount: 0, difficultyCounts: {} };
      existing.questionCount += 1;
      existing.difficultyCounts![row.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] =
        (existing.difficultyCounts![row.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] || 0) + 1;
      availabilityMap.set(row.conceptId, existing);
    }
    const profile = await getStudentLearningProfile(userId, null);
    const diagnostics = diagnoseStudent(profile);
    const plan = createAdaptiveLearningPlan({
      profile,
      diagnostics,
      availableConcepts: [...availabilityMap.values()],
      selectedExamIds,
    });
    focusConceptId = plan.selectedConceptId;
  }

  const session = await prisma.adaptiveSession.create({
    data: { userId, focusConceptId },
  });
  const concept = focusConceptId
    ? await prisma.taxonomyNode.findUnique({ where: { id: focusConceptId } })
    : null;
  await prisma.userActivity.create({
    data: { userId, type: 'ADAPTIVE_SESSION_STARTED', metadata: { teacherSessionId: session.id, focusConceptId } },
  });
  const welcomePrompt = concept?.nameEnglish
    ? `Write one warm, natural opening message from a private tutor to a student. Mention exactly that the next topic is ${concept.nameEnglish}. Do not use generic quiz language or mention that you are an AI.`
    : 'Write one warm, natural opening message from a private tutor beginning a new study conversation. Do not use generic quiz language or mention that you are an AI.';
  const welcomeAi = await generateOptional(userId, welcomePrompt);
  return res.json({
    id: session.id,
    teacherMode: true,
    focusTopic: concept?.nameEnglish || null,
    welcome: welcomeAi.status === 200 && welcomeAi.body.generated
      ? welcomeAi.body.text
      : concept?.nameEnglish
      ? `Hi! We’ll work through ${concept.nameEnglish} together. I’ll explain the idea, then we’ll try one question at a time.`
      : 'Hi! Let’s start with a friendly lesson. I’ll choose a useful topic and guide you one question at a time.',
  });
});

router.get('/session/:sessionId/next', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const session = await prisma.adaptiveSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session || session.userId !== userId) return res.status(404).json({ message: 'Teacher session not found' });

  const previousLock = nextSessionLocks.get(session.id) || Promise.resolve();
  let releaseLock!: () => void;
  const lockPromise = new Promise<void>((resolve) => { releaseLock = resolve; });
  nextSessionLocks.set(session.id, lockPromise);
  await previousLock;
  try {
  const seenItems = await prisma.adaptiveItem.findMany({
    where: { sessionId: session.id },
    select: { questionId: true },
  });
  const seenIds = seenItems.map((item) => item.questionId);
  const recentAttempts = await prisma.questionAttempt.findMany({
    where: { userId },
    select: { questionId: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  const recentlyAttemptedIds = [...new Set(recentAttempts.map((attempt) => attempt.questionId))];
  const excludedIds = [...new Set([...seenIds, ...recentlyAttemptedIds])];
  const selectedExams = await prisma.userExam.findMany({
    where: { userId },
    select: { examId: true },
  });
  const selectedExamIds = selectedExams.map((item) => item.examId);
  const profile = await getStudentLearningProfile(userId, session.id);
  const diagnostics = diagnoseStudent(profile);
  const availabilityRows = await prisma.question.findMany({
    where: {
      isActive: true,
      conceptId: { not: null },
      ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
      ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
    },
    select: {
      conceptId: true,
      difficulty: true,
      chapter: { select: { subject: { select: { id: true, examId: true } } } },
    },
  });
  const availabilityMap = new Map<number, AvailableConcept>();
  for (const row of availabilityRows) {
    if (row.conceptId === null) continue;
    const existing = availabilityMap.get(row.conceptId) || {
      conceptId: row.conceptId,
      questionCount: 0,
      difficultyCounts: {},
      examIds: [],
      subjectIds: [],
    };
    existing.questionCount += 1;
    existing.difficultyCounts![row.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] =
      (existing.difficultyCounts![row.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] || 0) + 1;
    existing.examIds = [...new Set([...(existing.examIds || []), row.chapter.subject.examId])];
    existing.subjectIds = [...new Set([...(existing.subjectIds || []), row.chapter.subject.id])];
    availabilityMap.set(row.conceptId, existing);
  }
  const availableConcepts = [...availabilityMap.values()];
  let plan = createAdaptiveLearningPlan({
    profile,
    diagnostics,
    availableConcepts,
    selectedExamIds,
    currentLearningFocusId: session.focusConceptId,
  });
  if (plan.selectedAction === 'no_available_question' || plan.selectedConceptId === null) {
    return res.json({ done: true, message: 'I\u0027ve run out of stored questions for the current learning objective. No unrelated topic has been chosen.' });
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
    return res.json({ done: true, message: 'Nicely done! I\u0027ve run out of stored questions for this topic. We can review another topic or come back later.' });
  }

  const conceptId = question.conceptId;
  await prisma.adaptiveItem.create({
    data: { sessionId: session.id, questionId: question.id, order: seenItems.length + 1 },
  });
  await prisma.adaptiveSession.update({
    where: { id: session.id },
    data: { focusConceptId: conceptId },
  });

  const node = conceptId ? await prisma.taxonomyNode.findUnique({ where: { id: conceptId } }) : null;
  const stats = conceptId
    ? await prisma.userConceptStat.findFirst({ where: { userId, conceptId } })
    : null;
  const accuracy = stats?.total ? Math.round((stats.correct / stats.total) * 100) : null;
  const teachingContext = buildTeachingContext({
    profile,
    diagnostics,
    plan,
    currentConceptName: node?.nameEnglish || null,
    currentQuestion: {
      text: question.text,
      options: normalizeOptions(question.options),
      storedExplanation: question.explanation,
    },
  });
  const introductionPrompt = [
    'Act as a warm, attentive private teacher chatting naturally with one student.',
    'Teach one small idea in one to three short chat bubbles, with one idea per bubble.',
    `Use the latest measured accuracy of ${accuracy ?? 'not yet measured'}% only when it helps explain the teaching choice.`,
    'Do not print or announce a topic name, syllabus label, or category string.',
    'Connect the explanation to what the student has shown they understand; never use stock encouragement.',
    `Curated source available for this question: ${node?.description || 'none'}.`,
    'If the source note is missing, teach only the verified facts from the question and say when a detail cannot be confirmed.',
    `Verified question: ${question.text}`,
    `Options: ${normalizeOptions(question.options).map((option, index) => `${String.fromCharCode(65 + index)}: ${option}`).join('; ')}`,
    'Introduce the practice item conversationally, without revealing the answer or correct option.',
    'Always end by asking the student to choose, explain why, or send the answer.',
    serializeTeachingContext(teachingContext),
  ].join(' ');
  const introductionAi = await generateOptional(userId, introductionPrompt);

  const { correctOption, ...safeQuestion } = question;
  return res.json({
    done: false,
    questionNumber: seenItems.length + 1,
    question: {
      ...safeQuestion,
      options: normalizeOptions(question.options),
      correctOption,
    },
    concept: {
      id: conceptId,
      name: node?.nameEnglish || question.chapter.name,
      description: node?.description || null,
      sourceMissing: !node?.description,
      accuracy,
    },
    teacherMessage: composeQuestionIntroduction(question.text, node?.nameEnglish || question.chapter.name),
    aiUnavailable: false,
  });
} finally {
  releaseLock();
  if (nextSessionLocks.get(session.id) === lockPromise) nextSessionLocks.delete(session.id);
}
});

router.post('/session/:sessionId/answer', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const session = await prisma.adaptiveSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session || session.userId !== userId) return res.status(404).json({ message: 'Teacher session not found' });

  const selectedOption = Number(req.body?.selectedOption);
  const questionId = String(req.body?.questionId || '');
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) return res.status(404).json({ message: 'Question not found' });
  if (!Number.isInteger(selectedOption) || selectedOption < 0) return res.status(400).json({ message: 'Please select one answer option' });
  if (selectedOption >= normalizeOptions(question.options).length) {
    return res.status(400).json({ message: 'Selected answer option is invalid' });
  }

  const isCorrect = selectedOption === question.correctOption;
  const [profileBefore, existingRevision] = await Promise.all([
    getStudentLearningProfile(userId, session.id),
    question.conceptId
      ? prisma.conceptRevision.findUnique({ where: { userId_conceptId: { userId, conceptId: question.conceptId } } })
      : Promise.resolve(null),
  ]);
  const conceptBefore = question.conceptId
    ? profileBefore.academic.concepts.find((item) => item.conceptId === question.conceptId)
    : undefined;
  const repeatedMistakesBefore = question.conceptId
    ? profileBefore.behaviour.repeatedMistakes
      .filter((item) => item.conceptId === question.conceptId)
      .reduce((sum, item) => sum + item.incorrectAttempts, 0)
    : 0;
  const rawSubmissionKey = typeof req.body?.submissionKey === 'string'
    ? req.body.submissionKey.trim()
    : '';
  if (rawSubmissionKey && (
    rawSubmissionKey.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(rawSubmissionKey)
  )) {
    return res.status(400).json({ message: 'Invalid submission key' });
  }
  const submissionKey = rawSubmissionKey
    ? `answer:${userId}:${session.id}:${questionId}:${rawSubmissionKey}`
    : `answer:${userId}:${session.id}:${questionId}`;

  let submitted;
  try {
    submitted = await submitAnswerAtomically(prisma, {
      userId,
      sessionId: session.id,
      questionId,
      selectedOption,
      timeTaken: Number(req.body?.timeTaken) || 0,
      submissionKey,
      isCorrect,
      conceptId: question.conceptId,
      chapterId: question.chapterId,
      masteryBefore: conceptBefore?.accuracy ?? null,
      previousMastery: existingRevision?.masterySnapshot ?? null,
      attemptCountBefore: conceptBefore?.attempts || 0,
      repeatedMistakes: repeatedMistakesBefore,
      existingIntervalDays: existingRevision?.intervalDays ?? null,
      consecutiveSuccesses: existingRevision?.consecutiveSuccesses || 0,
    });
  } catch (error) {
    if (error instanceof AnswerSubmissionError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }

  if (submitted.duplicate) {
    return res.json({
      isCorrect: submitted.isCorrect,
      correctOption: question.correctOption,
      explanation: question.explanation || null,
      teacherFeedback: null,
      aiUnavailable: true,
      diagnosis: submitted.isCorrect
        ? 'This answer was already recorded.'
        : 'This answer attempt was already recorded.',
      nextDifficulty: nextDifficulty(undefined, submitted.isCorrect),
      duplicate: true,
    });
  }

  const options = normalizeOptions(question.options);
  const [profile, selectedExams, availabilityRows] = await Promise.all([
    getStudentLearningProfile(userId, session.id),
    prisma.userExam.findMany({ where: { userId }, select: { examId: true } }),
    prisma.question.findMany({
      where: {
        isActive: true,
        conceptId: { not: null },
      },
      select: { conceptId: true, difficulty: true, chapter: { select: { subject: { select: { examId: true } } } } },
    }),
  ]);
  const selectedExamIds = selectedExams.map((item) => item.examId);
  const diagnostics = diagnoseStudent(profile);
  const availabilityMap = new Map<number, AvailableConcept>();
  for (const row of availabilityRows) {
    if (row.conceptId === null) continue;
    if (selectedExamIds.length && !selectedExamIds.includes(row.chapter.subject.examId)) continue;
    const existing = availabilityMap.get(row.conceptId) || { conceptId: row.conceptId, questionCount: 0, difficultyCounts: {} };
    existing.questionCount += 1;
    existing.difficultyCounts![row.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] =
      (existing.difficultyCounts![row.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] || 0) + 1;
    availabilityMap.set(row.conceptId, existing);
  }
  const plan = createAdaptiveLearningPlan({
    profile,
    diagnostics,
    availableConcepts: [...availabilityMap.values()],
    selectedExamIds,
    currentLearningFocusId: question.conceptId || profile.currentState.currentLearningFocusId,
  });
  const teachingContext = buildTeachingContext({
    profile,
    diagnostics,
    plan,
    currentConceptName: null,
    currentQuestion: {
      text: question.text,
      options,
      correctOption: question.correctOption,
      storedExplanation: question.explanation,
    },
    studentFeedback: isCorrect ? 'The student answered correctly.' : 'The student answered incorrectly.',
  });
  const feedbackPrompt = [
    'ROLE: Reply as a warm, accurate private teacher checking one student answer.',
    'STYLE: Use one to three short chat bubbles, with no headings or bullet lists. Do not use stock filler.',
    `The student chose ${String.fromCharCode(65 + selectedOption)}: ${optionName(options, selectedOption)}.`,
    isCorrect
      ? 'The student was correct. Acknowledge the specific idea or calculation they used, then move on or raise difficulty.'
      : 'The student was wrong. Name what their selected choice actually means or does, then clearly state the correct answer in words.',
    `Question: ${question.text}`,
    `Correct answer: ${String.fromCharCode(65 + question.correctOption)}: ${optionName(options, question.correctOption)}.`,
    question.explanation ? `Verified stored explanation: ${question.explanation}` : 'No stored explanation is available; explain only what follows directly from the question and do not guess.',
    'If wrong, explain the misconception in two short sentences, offer a different angle or hint, then keep the next item on the same topic.',
    'If right, praise a specific insight and connect the next step to their performance.',
    'Always end with the next step: a similar question, a hint offer, or a short check-in.',
    serializeTeachingContext(teachingContext),
  ].join('\n');
  const feedbackAi = { status: 502, body: { unavailable: true, generated: false, text: null } };
  const nextDifficultyValue = plan.selectedDifficulty === 'HARD'
    ? Difficulty.HARD
    : plan.selectedDifficulty === 'MEDIUM'
      ? Difficulty.MEDIUM
      : Difficulty.EASY;
  return res.json({
    isCorrect,
    correctOption: question.correctOption,
    explanation: question.explanation || null,
    teacherFeedback: composeAnswerFeedback({
      questionText: question.text,
      options,
      selectedOption,
      correctOption: question.correctOption,
      isCorrect,
      explanation: question.explanation,
      conceptName: null,
    }),
    aiUnavailable: false,
    diagnosis: isCorrect
      ? 'Nice work—you used the right idea. We’ll gently increase the challenge next.'
      : 'That answer was close. Let’s review the method and retry with an easier question so the idea becomes clear.',
    nextDifficulty: nextDifficultyValue,
  });
});

router.post('/next-difficulty', authenticate, (req, res) => {
  return res.json({ difficulty: nextDifficulty(req.body?.previous, Boolean(req.body?.correct)) });
});

export async function generateOptional(userKey: string, prompt: string): Promise<{ status: number; body: any }> {
  if (!process.env.AI_API_KEY || !process.env.AI_API_URL) {
    return { status: 200, body: { unavailable: true, message: 'AI generation is unavailable. Stored hints and bank explanations remain available.' } };
  }
  const limit = Math.max(1, Number(process.env.AI_RPM || 30));
  const now = Date.now();
  const window = rateWindows.get(userKey);
  if (window && window.resetAt > now && window.count >= limit) {
    return { status: 429, body: { unavailable: true, message: 'AI generation rate limit reached. Stored practice is still usable.', retryAfterSeconds: Math.ceil((window.resetAt - now) / 1000) } };
  }
  rateWindows.set(userKey, window && window.resetAt > now ? { count: window.count + 1, resetAt: window.resetAt } : { count: 1, resetAt: now + 60000 });
  try {
    if (process.env.AI_FALLBACK_API_URL && process.env.AI_FALLBACK_API_KEY) {
      const groq = await generateOpenAiCompatible(
        process.env.AI_FALLBACK_API_URL,
        process.env.AI_FALLBACK_API_KEY,
        process.env.AI_FALLBACK_MODEL || 'llama-3.3-70b-versatile',
        prompt,
      );
      if (groq.ok) {
        return { status: 200, body: { unavailable: false, generated: true, fallbackProvider: 'groq', text: groq.text } };
      }
      console.error(JSON.stringify({ event: 'ai_fallback_exhausted', provider: 'groq', result: 'failed' }));
    }

    // Primary Gemini temporarily skipped to avoid gateway timeout.
    // const primaryResult = await generateFromConfiguredProvider(prompt);
    // if (primaryResult.ok) return { status: 200, body: { unavailable: false, generated: true, text: primaryResult.text } };

    // OpenRouter temporarily skipped to avoid gateway timeout.
    /*
    if (process.env.AI_FALLBACK2_API_URL && process.env.AI_FALLBACK2_API_KEY) {
      const secondFallback = await generateOpenAiCompatible(
        process.env.AI_FALLBACK2_API_URL,
        process.env.AI_FALLBACK2_API_KEY,
        process.env.AI_FALLBACK2_MODEL || 'openai/gpt-oss-20b:free',
        prompt,
      );
      if (secondFallback.ok) {
        return { status: 200, body: { unavailable: false, generated: true, fallbackProvider: 'openrouter', text: secondFallback.text } };
      }
      console.error(JSON.stringify({ event: 'ai_fallback_exhausted', provider: 'openrouter', result: 'failed' }));
    }
    */
    console.error(JSON.stringify({ event: 'ai_all_providers_exhausted' }));
    return { status: 502, body: { unavailable: true, message: 'The configured AI providers are unavailable. Stored practice is still usable.' } };
  } catch (error: any) {
    console.error(JSON.stringify({ event: 'ai_generation_exception', error: sanitizeNetworkError(error) }));
    return { status: 502, body: { unavailable: true, message: 'AI generation could not be reached. Stored practice is still usable.' } };
  }
}

async function generateFromConfiguredProvider(prompt: string): Promise<{ ok: boolean; text: string | null }> {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const isGemini = provider === 'gemini' || provider === 'google'
    || process.env.AI_API_URL!.includes('generativelanguage.googleapis.com');
  if (isGemini) {
    const groundedPrompt = [
      'You are a patient, accurate private exam teacher, not a chatbot assistant.',
      'Every reply must teach. Use one to three short conversational bubbles with one idea per bubble.',
      'Use the exact student performance and question context. Never print raw topic names or category tags.',
      'Verify every fact against the supplied context. Never reveal an answer before an attempt or claim official predictions.',
      'Wrong answers: name the chosen option in words, state the correct answer in words, explain the mismatch, stay on topic, and offer a similar item.',
      'Always end with a question, hint offer, or short check-in. Never use stock filler or headings.',
      prompt,
    ].join('\n\n');
    const startedAt = Date.now();
    const endpoint = redactEndpoint(process.env.AI_API_URL!);
    const model = process.env.AI_MODEL || 'gemini-1.5-flash';
    try {
      const response = await fetch(process.env.AI_API_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.AI_API_KEY! },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: groundedPrompt }] }],
          generationConfig: { maxOutputTokens: Number(process.env.AI_MAX_TOKENS || 220), temperature: 0.8 },
        }),
        signal: AbortSignal.timeout(Math.min(Number(process.env.AI_TIMEOUT_MS || 15000), 2000)),
      });
      const durationMs = Date.now() - startedAt;
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(JSON.stringify({ event: 'ai_provider_failure', provider: 'gemini', model, endpoint, status: response.status, durationMs, error: sanitizeProviderError(body, prompt) }));
        return { ok: false, text: null };
      }
      const data = await response.json() as any;
      const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').filter(Boolean).join('\n');
      if (typeof text !== 'string' || text.length === 0) {
        console.error(JSON.stringify({ event: 'ai_provider_empty_response', provider: 'gemini', model, endpoint, durationMs }));
      }
      return { ok: typeof text === 'string' && text.length > 0, text: typeof text === 'string' ? text : null };
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      console.error(JSON.stringify({ event: 'ai_provider_network_error', provider: 'gemini', model, endpoint, durationMs, error: sanitizeNetworkError(error) }));
      return { ok: false, text: null };
    }
  }
  return generateOpenAiCompatible(
    process.env.AI_API_URL!,
    process.env.AI_API_KEY!,
    process.env.AI_MODEL || 'default',
    prompt,
  );
}

async function generateOpenAiCompatible(url: string, apiKey: string, model: string, prompt: string): Promise<{ ok: boolean; text: string | null }> {
  const isGroq = url.includes('api.groq.com');
  const tokenLimit = Number(process.env.AI_MAX_TOKENS || 180);
  const endpoint = redactEndpoint(url);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: [
              'You are a patient, accurate private exam teacher chatting with one student.',
              'Every reply must teach something. Use natural conversational bubbles: one to three short bubbles, one idea per bubble.',
              'Check every explanation against the supplied question, options, and stored source. Never give unverified facts, reveal an answer before an attempt, or claim official predictions.',
              'Never print raw topic names or category tags. On a wrong answer, name the chosen option in words, state the correct answer in words, explain the misconception, stay on the topic, and offer a similar item.',
              'On a right answer, praise something specific, then move on or raise difficulty.',
              'Always end with a question, hint offer, or short check-in. Never use stock filler, headings, or bullet lists.',
            ].join(' '),
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        ...(isGroq ? { max_completion_tokens: tokenLimit } : { max_tokens: tokenLimit }),
      }),
      signal: AbortSignal.timeout(Math.min(Number(process.env.AI_TIMEOUT_MS || 15000), 2000)),
    });
    const durationMs = Date.now() - startedAt;
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(JSON.stringify({ event: 'ai_provider_failure', provider: isGroq ? 'groq' : 'openai-compatible', model, endpoint, status: response.status, durationMs, error: sanitizeProviderError(body, prompt) }));
      return { ok: false, text: null };
    }
const data = await response.json() as any;
const rawText = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.reasoning || data?.response || data?.message?.content;
console.log(JSON.stringify({ event: 'groq_raw', contentLength: rawText?.length ?? 0, preview: String(rawText || '').slice(0,100) }));
const text = rawText;
    if (typeof text !== 'string' || text.length === 0) {
      console.error(JSON.stringify({ event: 'ai_provider_empty_response', provider: isGroq ? 'groq' : 'openai-compatible', model, endpoint, durationMs }));
    }
    return { ok: typeof text === 'string' && text.length > 0, text: typeof text === 'string' ? text : null };
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    console.error(JSON.stringify({ event: 'ai_provider_network_error', provider: isGroq ? 'groq' : 'openai-compatible', model, endpoint, durationMs, error: sanitizeNetworkError(error) }));
    return { ok: false, text: null };
  }
}

function redactEndpoint(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'invalid-endpoint';
  }
}

function sanitizeProviderError(body: string, prompt?: string): string {
  let sanitized = body.replace(/\s+/g, ' ').trim().slice(0, 300);
  const secrets = [
    process.env.AI_API_KEY,
    process.env.AI_FALLBACK_API_KEY,
    process.env.AI_FALLBACK2_API_KEY,
  ].filter(Boolean) as string[];
  for (const secret of secrets) {
    sanitized = sanitized.split(secret).join('[REDACTED]');
  }
  if (prompt) {
    sanitized = sanitized.split(prompt).join('[REDACTED]');
  }
  return sanitized;
}

function sanitizeNetworkError(error: any): string {
  return String(error?.name || error?.code || 'network_error') + ': ' + String(error?.message || '').slice(0, 200);
}

router.post('/understand', authenticate, async (req: AuthRequest, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const message = String(req.body?.message || '').trim();
  console.log(JSON.stringify({ event: 'understand_start', requestId, message: message.slice(0,200) }));
  if (!message) return res.status(400).json({ message: 'Message is required' });
  const prompt = `Classify the student message into one intent: CASUAL_CONVERSATION, GREETING, CONCEPT_EXPLANATION, DOUBT_SOLVING, STUDENT_UNCERTAINTY, HINT_REQUEST, PERFORMANCE_REQUEST, PROGRESS_INQUIRY, PRACTICE_REQUEST, ANSWER_SUBMISSION, ALTERNATIVE_EXPLANATION, ENCOURAGEMENT, GENERAL_STUDY_HELP. Return only JSON: {"intent":"...","confidence":0.0}. Message: ${message}`;
  const result = await generateOptional(req.user!.id, prompt);
  let intent = 'GENERAL_STUDY_HELP';
  let confidence = 0;
  if (result.body?.generated && result.body?.text) {
    try {
      const match = String(result.body.text).match(/\{.*\}/s);
      const parsed = JSON.parse(match ? match[0] : '{}');
      if (typeof parsed.intent === 'string') intent = parsed.intent;
      if (typeof parsed.confidence === 'number') confidence = parsed.confidence;
    } catch {}
  }
  if (confidence < 0.6) {
    intent = classifyIntent(message);
  }
  console.log(JSON.stringify({ event: 'understand_result', requestId, intent, confidence, generated: !!result.body?.generated }));
  return res.json({ intent, confidence });
});

export default router;








