import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { normalizeOptions } from '../lib/options';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get questions by chapter
router.get('/chapter/:chapterId', authenticate, async (req: AuthRequest, res: Response) => {
  const { chapterId } = req.params;
  const questions = await prisma.question.findMany({
    where: { chapterId, isActive: true },
    select: {
      id: true, text: true, options: true,
      difficulty: true, tags: true, chapter: { select: { name: true } },
      concept: { select: { id: true, level: true, nameEnglish: true } },
    },
  });
  return res.json(questions.map((q) => ({ ...q, options: normalizeOptions(q.options) })));
});

// Report a question error
router.post('/:questionId/report', authenticate, async (req: AuthRequest, res: Response) => {
  const { questionId } = req.params;
  const { reason, details } = req.body;
  const userId = req.user!.id;

  const report = await prisma.questionReport.create({
    data: { userId, questionId, reason, details },
  });

  await prisma.userActivity.create({
    data: { userId, type: 'QUESTION_FLAGGED', metadata: { questionId, reason } },
  });

  return res.status(201).json(report);
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

// Flag a question (bookmark for later review)
router.post('/:questionId/flag', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { questionId } = req.params;

  const existing = await prisma.flaggedQuestion.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });

  if (existing) {
    return res.json({ flagged: true });
  }

  await prisma.flaggedQuestion.create({
    data: { userId, questionId },
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

  return res.json(flagged.map((f) => ({
    id: f.question.id,
    text: f.question.text,
    options: normalizeOptions(f.question.options),
    correctOption: f.question.correctOption,
    explanation: f.question.explanation,
    difficulty: f.question.difficulty,
    chapter: f.question.chapter.name,
    subject: f.question.chapter.subject.name,
    exam: f.question.chapter.subject.exam.name,
    concept: f.question.concept,
    flaggedAt: f.createdAt,
  })));
});

export default router;
