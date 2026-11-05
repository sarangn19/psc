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

router.post('/lesson-meta', authenticate, async (req: AuthRequest, res) => {
  const conceptId = Number(req.body?.conceptId);
  if (!Number.isInteger(conceptId)) return res.status(400).json({ message: 'conceptId is required' });
  const node = await prisma.taxonomyNode.findUnique({ where: { id: conceptId }, include: { parent: true } });
  return res.json({ name: node?.nameEnglish || 'Topic', description: node?.description || null, sourceMissing: !node?.description });
});

router.post('/session/start', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const requestedConceptId = Number(req.body?.conceptId);
  let focusConceptId = Number.isInteger(requestedConceptId) ? requestedConceptId : null;

  if (!focusConceptId) {
    const weakStats = await prisma.userConceptStat.findMany({
      where: { userId, conceptId: { not: null }, total: { gt: 0 } },
      select: { conceptId: true, total: true, correct: true },
      take: 100,
    });
    const weakest = [...weakStats].sort((a, b) =>
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
  return res.json({
    id: session.id,
    teacherMode: true,
    focusTopic: concept?.nameEnglish || null,
    welcome: concept?.nameEnglish
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

  const candidates = await prisma.question.findMany({
    where: {
      isActive: true,
      ...(session.focusConceptId ? { conceptId: session.focusConceptId } : {}),
      ...(seenIds.length ? { id: { notIn: seenIds } } : {}),
    },
    include: { chapter: { include: { subject: true } }, concept: true },
    take: 25,
    orderBy: [{ difficulty: 'asc' }, { updatedAt: 'desc' }],
  });
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
    teacherMessage: seenItems.length === 0
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

  return res.json({
    isCorrect,
    correctOption: question.correctOption,
    explanation: question.explanation || null,
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
