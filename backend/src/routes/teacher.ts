import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { buildDayPlan, nextDifficulty } from '../lib/teacher';
import { Difficulty, Prisma } from '@prisma/client';
import { normalizeOptions } from '../lib/options';

const router = Router();

interface RateWindow { count: number; resetAt: number }
const rateWindows = new Map<string, RateWindow>();

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
  const result = await generateOptional(req.user!.id, `Give a short study hint. Do not reveal the answer letter or value. Question: ${question.text}. Topic: ${question.concept?.nameEnglish || question.chapter.name}.`);
  return res.status(result.status).json(result.body);
});

router.post('/conversation', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Message is required' });

  const [selected, stats, currentQuestion] = await Promise.all([
    prisma.userExam.findMany({
      where: { userId },
      include: { exam: { select: { name: true } } },
    }),
    prisma.userConceptStat.findMany({
      where: { userId, conceptId: { not: null }, total: { gt: 0 } },
      select: { conceptId: true, total: true, correct: true },
      take: 12,
    }),
    req.body?.questionId
      ? prisma.question.findUnique({
          where: { id: String(req.body.questionId) },
          include: { chapter: { include: { subject: true } }, concept: true },
        })
      : null,
  ]);
  const weakIds = stats
    .filter((stat) => stat.correct / stat.total < 0.7)
    .map((stat) => stat.conceptId)
    .filter((id): id is number => id !== null);
  const weakNodes = weakIds.length
    ? await prisma.taxonomyNode.findMany({ where: { id: { in: weakIds } }, select: { nameEnglish: true } })
    : [];
  const examNames = selected.map((item) => item.exam.name);
  const prompt = [
    'Act as the student’s friendly private exam teacher. Reply naturally to the student and stay grounded in their syllabus and performance.',
    `Selected exams: ${examNames.length ? examNames.join(', ') : 'not selected yet'}.`,
    `Weak topics: ${weakNodes.map((node) => node.nameEnglish).join(', ') || 'no clear weak topic yet'}.`,
    currentQuestion
      ? `Current topic: ${currentQuestion.concept?.nameEnglish || currentQuestion.chapter.name}. Current question: ${currentQuestion.text}`
      : 'There is no active practice question.',
    `Student message: ${message}`,
    'If the request is for a hint, help without revealing the answer option or value. If it asks for an explanation, teach it simply. Do not claim official predictions or certainty.',
  ].join('\n');
  const result = await generateOptional(userId, prompt);
  return res.status(result.status).json(result.body);
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
    const weakStats = await prisma.userConceptStat.findMany({
      where: { userId, conceptId: { not: null }, total: { gt: 0 } },
      select: { conceptId: true, total: true, correct: true },
      take: 100,
    });
    const eligibleQuestions = selectedExamIds.length
      ? await prisma.question.findMany({
          where: {
            isActive: true,
            chapter: { subject: { examId: { in: selectedExamIds } } },
            conceptId: { not: null },
          },
          select: { conceptId: true },
          distinct: ['conceptId'],
        })
      : await prisma.question.findMany({
          where: { isActive: true, conceptId: { not: null } },
          select: { conceptId: true },
          distinct: ['conceptId'],
        });
    const eligibleConceptIds = new Set(eligibleQuestions.map((item) => item.conceptId).filter((id): id is number => id !== null));
    const weakest = [...weakStats]
      .filter((stat) => eligibleConceptIds.has(stat.conceptId!))
      .sort((a, b) =>
      (a.correct / a.total) - (b.correct / b.total)
    )[0];
    focusConceptId = weakest?.conceptId || null;
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

  const seenItems = await prisma.adaptiveItem.findMany({
    where: { sessionId: session.id },
    select: { questionId: true },
  });
  const seenIds = seenItems.map((item) => item.questionId);
  const selectedExams = await prisma.userExam.findMany({
    where: { userId },
    select: { examId: true },
  });
  const selectedExamIds = selectedExams.map((item) => item.examId);
  const latestAttempt = await prisma.questionAttempt.findFirst({
    where: { userId, sessionId: session.id },
    orderBy: { createdAt: 'desc' },
    include: { question: { select: { difficulty: true, conceptId: true } } },
  });
  const targetDifficulty = latestAttempt
    ? nextDifficulty(latestAttempt.question.difficulty, latestAttempt.isCorrect)
    : Difficulty.EASY;

  let candidates = await prisma.question.findMany({
    where: {
      isActive: true,
      ...(session.focusConceptId ? { conceptId: session.focusConceptId } : {}),
      ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
      ...(seenIds.length ? { id: { notIn: seenIds } } : {}),
      difficulty: targetDifficulty,
    },
    include: { chapter: { include: { subject: true } }, concept: true },
    take: 25,
    orderBy: [{ difficulty: 'asc' }, { updatedAt: 'desc' }],
  });
  if (!candidates.length) {
    candidates = await prisma.question.findMany({
      where: {
        isActive: true,
        ...(seenIds.length ? { id: { notIn: seenIds } } : {}),
        ...(selectedExamIds.length ? { chapter: { subject: { examId: { in: selectedExamIds } } } } : {}),
      },
      include: { chapter: { include: { subject: true } }, concept: true },
      take: 25,
      orderBy: [{ updatedAt: 'desc' }],
    });
  }
  if (candidates.length > 1) {
    const conceptIds = candidates.map((item) => item.conceptId).filter((id): id is number => id !== null);
    const conceptStats = conceptIds.length
      ? await prisma.userConceptStat.findMany({
          where: { userId, conceptId: { in: conceptIds } },
          select: { conceptId: true, total: true, correct: true },
        })
      : [];
    const accuracyByConcept = new Map(
      conceptStats.map((stat) => [
        stat.conceptId,
        stat.total > 0 ? stat.correct / stat.total : 0.5,
      ]),
    );
    candidates.sort((a, b) => {
      const aAccuracy = a.conceptId ? (accuracyByConcept.get(a.conceptId) ?? 0.5) : 0.5;
      const bAccuracy = b.conceptId ? (accuracyByConcept.get(b.conceptId) ?? 0.5) : 0.5;
      return aAccuracy - bAccuracy;
    });
  }
  const question = candidates[0];
  if (!question) return res.json({ done: true, message: 'Nicely done! I’ve run out of stored questions for this topic. We can review another topic or come back later.' });

  await prisma.adaptiveItem.create({
    data: { sessionId: session.id, questionId: question.id, order: seenItems.length + 1 },
  });

  const conceptId = question.conceptId;
  const node = conceptId ? await prisma.taxonomyNode.findUnique({ where: { id: conceptId } }) : null;
  const stats = conceptId
    ? await prisma.userConceptStat.findFirst({ where: { userId, conceptId } })
    : null;
  const accuracy = stats?.total ? Math.round((stats.correct / stats.total) * 100) : null;
  const topicName = node?.nameEnglish || question.chapter.name;
  const introductionPrompt = [
    `Act as a friendly private exam teacher for the student's selected syllabus.`,
    `Teach ${topicName} in one short, natural paragraph. Use the student's current accuracy of ${accuracy ?? 'not yet measured'}% when available.`,
    `Then introduce the stored practice question in a conversational way. Do not say the answer or reveal an option.`,
    `Use a calm encouraging tone. ${node?.description ? `Curated note: ${node.description}` : 'No curated note is available; clearly avoid claiming certainty.'}`,
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
    teacherMessage: introductionAi.status === 200 && introductionAi.body.generated
      ? introductionAi.body.text
      : seenItems.length === 0
      ? `Let’s begin with ${node?.nameEnglish || question.chapter.name}. Read the quick concept below, then try the question.`
      : 'You’re making progress. Let’s carry that learning into the next question.',
  });
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

  const isCorrect = selectedOption === question.correctOption;
  await Promise.all([
    prisma.questionAttempt.create({
      data: { userId, questionId, selectedOption, isCorrect, timeTaken: Number(req.body?.timeTaken) || 0, sessionId: session.id },
    }),
    prisma.adaptiveSession.update({
      where: { id: session.id },
      data: { totalQ: { increment: 1 }, correctQ: isCorrect ? { increment: 1 } : undefined },
    }),
    question.conceptId
      ? prisma.$executeRaw`
          INSERT INTO user_concept_stats (id, "userId", "conceptId", total, correct, "updatedAt")
          VALUES (gen_random_uuid()::text, ${userId}, ${question.conceptId}, 1, ${isCorrect ? 1 : 0}, now())
          ON CONFLICT ("userId", "conceptId") WHERE "conceptId" IS NOT NULL
          DO UPDATE SET total = user_concept_stats.total + 1,
                        correct = user_concept_stats.correct + ${isCorrect ? 1 : 0},
                        "updatedAt" = now()`
      : prisma.$executeRaw`
          INSERT INTO user_concept_stats (id, "userId", "chapterId", total, correct, "updatedAt")
          VALUES (gen_random_uuid()::text, ${userId}, ${question.chapterId}, 1, ${isCorrect ? 1 : 0}, now())
          ON CONFLICT ("userId", "chapterId") WHERE "chapterId" IS NOT NULL
          DO UPDATE SET total = user_concept_stats.total + 1,
                        correct = user_concept_stats.correct + ${isCorrect ? 1 : 0},
                        "updatedAt" = now()`,
  ]);
  prisma.userActivity.create({
    data: { userId, type: 'QUESTION_ANSWERED', metadata: { questionId, isCorrect, teacherSession: true } },
  }).catch(() => {});
  await prisma.adaptiveSession.update({
    where: { id: session.id },
    data: {
      focusConceptId: isCorrect
        ? null
        : question.conceptId || session.focusConceptId,
    },
  });
  const feedbackPrompt = [
    'Act as a warm, specific private exam teacher responding to one answer.',
    isCorrect ? 'The student answered correctly.' : 'The student answered incorrectly.',
    `Question: ${question.text}`,
    `Correct option: ${String.fromCharCode(65 + question.correctOption)}`,
    question.explanation ? `Stored explanation: ${question.explanation}` : 'No stored explanation is available.',
    'In 2-3 natural sentences, explain what was good or diagnose the mistake, state the idea clearly, and encourage the student. Do not offer a prediction guarantee or claim an official answer.',
  ].join(' ');
  const feedbackAi = await generateOptional(userId, feedbackPrompt);
  return res.json({
    isCorrect,
    correctOption: question.correctOption,
    explanation: question.explanation || null,
    teacherFeedback: feedbackAi.status === 200 && feedbackAi.body.generated
      ? feedbackAi.body.text
      : isCorrect
        ? (question.explanation || 'That is correct. The stored explanation was not available.')
        : `The correct answer is ${String.fromCharCode(65 + question.correctOption)}. ${question.explanation || 'The stored explanation was not available, so I can review the method together.'}`,
    diagnosis: isCorrect
      ? 'Nice work—you used the right idea. We’ll gently increase the challenge next.'
      : 'That answer was close. Let’s review the method and retry with an easier question so the idea becomes clear.',
    nextDifficulty: nextDifficulty(question.difficulty, isCorrect),
  });
});

router.post('/next-difficulty', authenticate, (req, res) => {
  return res.json({ difficulty: nextDifficulty(req.body?.previous, Boolean(req.body?.correct)) });
});

async function generateOptional(userKey: string, prompt: string): Promise<{ status: number; body: any }> {
  if (!process.env.AI_API_KEY || !process.env.AI_API_URL) {
    return { status: 200, body: { unavailable: true, message: 'AI generation is unavailable. Stored hints and bank explanations remain available.' } };
  }
  const limit = Math.max(1, Number(process.env.AI_RPM || 10));
  const now = Date.now();
  const window = rateWindows.get(userKey);
  if (window && window.resetAt > now && window.count >= limit) {
    return { status: 429, body: { unavailable: true, message: 'AI generation rate limit reached. Stored practice is still usable.', retryAfterSeconds: Math.ceil((window.resetAt - now) / 1000) } };
  }
  rateWindows.set(userKey, window && window.resetAt > now ? { count: window.count + 1, resetAt: window.resetAt } : { count: 1, resetAt: now + 60000 });
  try {
    const primary = await generateFromConfiguredProvider(prompt);
    if (primary.ok) return { status: 200, body: { unavailable: false, generated: true, text: primary.text } };

    if (process.env.AI_FALLBACK_API_URL && process.env.AI_FALLBACK_API_KEY) {
      const fallback = await generateOpenAiCompatible(
        process.env.AI_FALLBACK_API_URL,
        process.env.AI_FALLBACK_API_KEY,
        process.env.AI_FALLBACK_MODEL || 'llama-3.3-70b-versatile',
        prompt,
      );
      if (fallback.ok) {
        return { status: 200, body: { unavailable: false, generated: true, fallbackProvider: 'groq', text: fallback.text } };
      }
    }

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
    }
    return { status: 502, body: { unavailable: true, message: 'The configured AI providers are unavailable. Stored practice is still usable.' } };
  } catch {
    return { status: 502, body: { unavailable: true, message: 'AI generation could not be reached. Stored practice is still usable.' } };
  }
}

async function generateFromConfiguredProvider(prompt: string): Promise<{ ok: boolean; text: string | null }> {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const isGemini = provider === 'gemini' || provider === 'google'
    || process.env.AI_API_URL!.includes('generativelanguage.googleapis.com');
  if (isGemini) {
    const response = await fetch(process.env.AI_API_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.AI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: Number(process.env.AI_MAX_TOKENS || 180) },
      }),
      signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 15000)),
    });
    if (!response.ok) return { ok: false, text: null };
    const data = await response.json() as any;
    const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').filter(Boolean).join('\n');
    return { ok: typeof text === 'string' && text.length > 0, text: typeof text === 'string' ? text : null };
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
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(isGroq ? { max_completion_tokens: tokenLimit } : { max_tokens: tokenLimit }),
    }),
    signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 15000)),
  });
  if (!response.ok) return { ok: false, text: null };
  const data = await response.json() as any;
  const text = data?.choices?.[0]?.message?.content || data?.response || data?.message?.content;
  return { ok: typeof text === 'string' && text.length > 0, text: typeof text === 'string' ? text : null };
}

export default router;
