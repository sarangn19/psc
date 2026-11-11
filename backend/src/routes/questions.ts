import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { normalizeOptions } from '../lib/options';
import { authenticate, AuthRequest } from '../middleware/auth';
import { filterSafeQuestions, getSafetyRecordSync, QuestionSafetyStatus } from '../lib/questionSafety';

const router = Router();

// Student feedback/suggestion
router.post('/feedback', authenticate, async (req: AuthRequest, res: Response) => {
  const { message, type } = req.body;
  const userId = req.user!.id;
  if (!message || !message.trim()) return res.status(400).json({ message: 'Feedback message is required' });
  await prisma.userActivity.create({ data: { userId, type: 'USER_FEEDBACK', metadata: { message, type } } });
  return res.json({ success: true });
});

import { getEligibleLearnedChapterIds, isChapterLearned } from '../lib/learningEligibility';

// Get questions by chapter
router.get('/chapter/:chapterId', authenticate, async (req: AuthRequest, res: Response) => {
  const { chapterId } = req.params;
  const userId = req.user!.id;
  const learned = await isChapterLearned(userId, chapterId);
  if (!learned) {
    return res.status(403).json({ message: 'Chapter not marked as Learned. Mark it in My Learning first.', code: 'CHAPTER_NOT_LEARNED' });
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));

  // Fetch extra to account for safety filtering
  const fetchSize = pageSize * 3;
  const questions = await prisma.question.findMany({
    where: { chapterId, isActive: true },
    skip: (page - 1) * fetchSize,
    take: fetchSize,
    select: {
      id: true, text: true, options: true, correctOption: true,
      difficulty: true, tags: true, chapter: { select: { name: true } },
      concept: { select: { id: true, level: true, nameEnglish: true } },
    },
  });

  const safeQuestions = await filterSafeQuestions(questions);
  const paginated = safeQuestions.slice(0, pageSize);

  // Get total count of safe questions for pagination
  const allQuestions = await prisma.question.findMany({
    where: { chapterId, isActive: true },
    select: { id: true },
  });
  const allSafe = await filterSafeQuestions(allQuestions);
  const total = allSafe.length;

  return res.json({
    items: paginated.map((q) => ({ ...q, options: normalizeOptions(q.options) })),
    total,
    page,
    pageSize,
  });
});

// Get user's performance per chapter
router.get('/performance', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    include: { question: { include: { chapter: { include: { subject: true } } } } },
  });

  // Group by chapter
  const chapterMap = new Map<string, { name: string; subjectName: string; total: number; correct: number }>();

  for (const attempt of attempts) {
    const chapterName = attempt.question.chapter.name;
    const subjectName = attempt.question.chapter.subject.name;
    const key = attempt.question.chapterId;

    if (!chapterMap.has(key)) {
      chapterMap.set(key, { name: chapterName, subjectName, total: 0, correct: 0 });
    }

    const entry = chapterMap.get(key)!;
    entry.total++;
    if (attempt.isCorrect) entry.correct++;
  }

  const performance = Array.from(chapterMap.entries()).map(([chapterId, data]) => ({
    chapterId,
    ...data,
    accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
    zone: data.total >= 5
      ? (data.correct / data.total >= 0.7 ? 'STRONG' : data.correct / data.total >= 0.4 ? 'MEDIUM' : 'WEAK')
      : 'UNTESTED',
  }));

  return res.json(performance);
});

// Flag a question with reason
router.post('/:questionId/flag', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { questionId } = req.params;
  const { reason, details } = req.body;

  const existing = await prisma.flaggedQuestion.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });

  if (existing) {
    await prisma.flaggedQuestion.update({
      where: { userId_questionId: { userId, questionId } },
      data: { reason: reason || 'general', details: details || null },
    });
    return res.json({ flagged: true, updated: true });
  }

  await prisma.flaggedQuestion.create({
    data: { userId, questionId, reason: reason || 'general', details: details || null },
  });

  return res.json({ flagged: true });
});

// Unflag a question
router.delete('/:questionId/flag', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { questionId } = req.params;

  await prisma.flaggedQuestion.deleteMany({
    where: { userId, questionId },
  });

  return res.json({ flagged: false });
});

// Get all flagged questions for user
router.get('/flagged', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const flagged = await prisma.flaggedQuestion.findMany({
    where: { userId },
    include: {
      question: {
        include: {
          chapter: { include: { subject: { include: { exam: true } } } },
          concept: { select: { id: true, nameEnglish: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const safeFlagged = await filterSafeQuestions(flagged.map((f) => f.question));

  return res.json(safeFlagged.map((q) => {
    const flag = flagged.find((f) => f.question.id === q.id)!;
    const safety = getSafetyRecordSync(q.id);
    return {
      id: q.id,
      text: q.text,
      options: normalizeOptions(q.options),
      correctOption: q.correctOption,
      explanation: q.explanation,
      difficulty: q.difficulty,
      chapter: q.chapter.name,
      subject: q.chapter.subject.name,
      exam: q.chapter.subject.exam.name,
      concept: q.concept,
      flaggedAt: flag.createdAt,
      safetyStatus: safety?.status || 'UNKNOWN',
      safetyBlocked: safety && (safety.status === QuestionSafetyStatus.BLOCKED_CONFIRMED || safety.status === QuestionSafetyStatus.REPAIRED_PENDING_VERIFICATION),
    };
  }));
});

export default router;

