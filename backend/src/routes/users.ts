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

// Get user streak (consecutive days with activity)
router.get('/streak', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const activities = await prisma.userActivity.findMany({
    where: { userId, type: 'QUESTION_ANSWERED' },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  if (activities.length === 0) return res.json({ streak: 0, todayCount: 0 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = new Set(
    activities.map((a) => {
      const d = new Date(a.createdAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })
  );

  const todayMs = today.getTime();
  const todayCount = activities.filter((a) => {
    const d = new Date(a.createdAt);
    return d.getTime() >= todayMs;
  }).length;

  let streak = 0;
  let check = todayMs;
  if (!days.has(todayMs)) {
    check -= 86400000;
  }

  while (days.has(check)) {
    streak++;
    check -= 86400000;
  }

  return res.json({ streak, todayCount });
});

// Get weekly comparison (this week vs last week)
router.get('/weekly', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const [thisWeekAttempts, lastWeekAttempts] = await Promise.all([
    prisma.questionAttempt.findMany({
      where: { userId, createdAt: { gte: startOfThisWeek } },
      select: { isCorrect: true },
    }),
    prisma.questionAttempt.findMany({
      where: { userId, createdAt: { gte: startOfLastWeek, lt: startOfThisWeek } },
      select: { isCorrect: true },
    }),
  ]);

  const summarize = (attempts: { isCorrect: boolean }[]) => ({
    total: attempts.length,
    correct: attempts.filter((a) => a.isCorrect).length,
    accuracy: attempts.length > 0 ? Math.round((attempts.filter((a) => a.isCorrect).length / attempts.length) * 100) : 0,
  });

  return res.json({
    thisWeek: summarize(thisWeekAttempts),
    lastWeek: summarize(lastWeekAttempts),
  });
});

export default router;
