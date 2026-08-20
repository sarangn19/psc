import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Toggle travel-friendly mode (hides math / pen-and-paper questions)
router.post('/travel-mode', authenticate, async (req: AuthRequest, res: Response) => {
  const { enabled } = req.body;
  const userId = req.user!.id;

  const user = await prisma.user.update({
    where: { id: userId },
    data: { travelMode: enabled === true },
    select: { travelMode: true },
  });

  return res.json(user);
});

// Get user dashboard stats
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const [totalAttempts, correctAttempts, totalSessions, learnedChapters] = await Promise.all([
    prisma.questionAttempt.count({ where: { userId } }),
    prisma.questionAttempt.count({ where: { userId, isCorrect: true } }),
    prisma.adaptiveSession.count({ where: { userId } }),
    prisma.userChapter.count({ where: { userId, isLearned: true } }),
  ]);

  const lastSession = await prisma.adaptiveSession.findFirst({
    where: { userId },
    orderBy: { startedAt: 'desc' },
  });

  // Weak zones
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    include: { question: { include: { chapter: { include: { subject: true } } } } },
  });

  const chapterMap = new Map<string, { name: string; total: number; correct: number }>();
  for (const attempt of attempts) {
    const key = attempt.question.chapterId;
    const name = attempt.question.chapter.name;
    if (!chapterMap.has(key)) chapterMap.set(key, { name, total: 0, correct: 0 });
    const e = chapterMap.get(key)!;
    e.total++;
    if (attempt.isCorrect) e.correct++;
  }

  const weakZones = Array.from(chapterMap.values())
    .filter((c) => c.total >= 5 && c.correct / c.total < 0.4)
    .map((c) => ({ ...c, accuracy: Math.round((c.correct / c.total) * 100) }));

  const strongZones = Array.from(chapterMap.values())
    .filter((c) => c.total >= 5 && c.correct / c.total >= 0.7)
    .map((c) => ({ ...c, accuracy: Math.round((c.correct / c.total) * 100) }));

  return res.json({
    totalAttempts,
    correctAttempts,
    accuracy: totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
    totalSessions,
    learnedChapters,
    lastSessionScore: lastSession?.score || 0,
    weakZones: weakZones.slice(0, 5),
    strongZones: strongZones.slice(0, 5),
  });
});

export default router;
