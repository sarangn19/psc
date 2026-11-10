import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get My Learning data: exams, subjects, chapters with user's learning status
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const [userChapters, allExams] = await Promise.all([
    prisma.userChapter.findMany({
      where: { userId },
      select: { chapterId: true, status: true, isLearned: true },
    }),
    prisma.exam.findMany({
      include: {
        subjects: {
          orderBy: { order: 'asc' },
          include: {
            chapters: {
              orderBy: { order: 'asc' },
              select: { id: true, name: true, order: true },
            },
          },
        },
      },
      orderBy: { category: 'asc' },
    }),
  ]);

  const statusMap = new Map<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'LEARNED'>();
  for (const uc of userChapters) {
    const resolved = (uc.status && uc.status !== 'NOT_STARTED')
      ? uc.status
      : (uc.isLearned ? 'LEARNED' : (uc.status || 'NOT_STARTED'));
    statusMap.set(uc.chapterId, resolved as any);
  }

  const exams = allExams.map((exam: any) => ({
    id: exam.id,
    name: exam.name,
    category: exam.category,
    subjects: exam.subjects.map((subject: any) => ({
      id: subject.id,
      name: subject.name,
      order: subject.order,
      chapters: subject.chapters.map((chapter: any) => ({
        id: chapter.id,
        name: chapter.name,
        order: chapter.order,
        status: statusMap.get(chapter.id) || 'NOT_STARTED',
      })),
    })),
  }));

  const learnedCount = userChapters.filter((c: any) => c.status === 'LEARNED' || c.isLearned).length;
  const inProgressCount = userChapters.filter((c: any) => c.status === 'IN_PROGRESS').length;
  const totalChapters = allExams.reduce((sum: number, e: any) => sum + e.subjects.reduce((s: number, sub: any) => s + sub.chapters.length, 0), 0);

  return res.json({
    exams,
    summary: {
      totalChapters,
      learnedCount,
      inProgressCount,
      notStartedCount: totalChapters - learnedCount - inProgressCount,
      completionPercent: totalChapters > 0 ? Math.round((learnedCount / totalChapters) * 100) : 0,
    },
  });
});

// Update a single chapter's learning status
router.patch('/chapter/:chapterId', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { chapterId } = req.params;
  const { status } = req.body;

  if (!['NOT_STARTED', 'IN_PROGRESS', 'LEARNED'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

  const userChapter = await prisma.userChapter.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    update: { status },
    create: { userId, chapterId, status },
  });

  await prisma.userActivity.create({
    data: { userId, type: 'CHAPTER_MARKED', metadata: { chapterId, status } },
  });

  return res.json(userChapter);
});

// Bulk update multiple chapters' learning status
router.patch('/bulk', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { chapterIds, status } = req.body;

  if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
    return res.status(400).json({ message: 'chapterIds array is required' });
  }
  if (!['NOT_STARTED', 'IN_PROGRESS', 'LEARNED'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const chapters = await prisma.chapter.findMany({
    where: { id: { in: chapterIds } },
    select: { id: true },
  });
  if (chapters.length !== chapterIds.length) {
    return res.status(404).json({ message: 'One or more chapters not found' });
  }

  const results = await Promise.all(
    chapterIds.map((chapterId: string) =>
      prisma.userChapter.upsert({
        where: { userId_chapterId: { userId, chapterId } },
        update: { status },
        create: { userId, chapterId, status },
      })
    )
  );

  await prisma.userActivity.create({
    data: { userId, type: 'CHAPTER_MARKED', metadata: { chapterIds, status, bulk: true } },
  });

  return res.json({ updated: results.length });
});

export default router;
