import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all exams
router.get('/', authenticate, async (_req, res: Response) => {
  const exams = await prisma.exam.findMany({
    include: {
      subjects: {
        orderBy: { order: 'asc' },
        include: {
          chapters: { orderBy: { order: 'asc' } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return res.json(exams);
});

// Select exams for user
router.post('/select', authenticate, async (req: AuthRequest, res: Response) => {
  const { examIds } = req.body;
  if (!Array.isArray(examIds)) return res.status(400).json({ message: 'examIds must be an array' });

  const userId = req.user!.id;

  // Clear existing selections and re-create
  await prisma.userExam.deleteMany({ where: { userId } });
  await prisma.userExam.createMany({
    data: examIds.map((examId: string) => ({ userId, examId })),
    skipDuplicates: true,
  });

  await prisma.userActivity.create({
    data: { userId, type: 'EXAM_SELECTED', metadata: { examIds } },
  });

  return res.json({ message: 'Exams selected successfully' });
});

// Get user's selected exams
router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  const userExams = await prisma.userExam.findMany({
    where: { userId: req.user!.id },
    include: {
      exam: {
        include: {
          subjects: {
            orderBy: { order: 'asc' },
            include: { chapters: { orderBy: { order: 'asc' } } },
          },
        },
      },
    },
  });
  return res.json(userExams.map((ue) => ue.exam));
});

// Mark/unmark chapter learning status
router.post('/chapters/mark', authenticate, async (req: AuthRequest, res: Response) => {
  const { chapterId, isLearned, status } = req.body;
  const userId = req.user!.id;

  const resolvedStatus = status || (isLearned === false ? 'NOT_STARTED' : 'LEARNED');

  await prisma.userChapter.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    update: { status: resolvedStatus },
    create: { userId, chapterId, status: resolvedStatus },
  });

  prisma.userActivity.create({
    data: { userId, type: 'CHAPTER_MARKED', metadata: { chapterId, status: resolvedStatus } },
  }).catch(() => {});

  return res.json({ message: 'Chapter status updated' });
});

// Batch mark chapters
router.post('/chapters/mark-batch', authenticate, async (req: AuthRequest, res: Response) => {
  const { chapterIds, isLearned, status } = req.body;
  if (!Array.isArray(chapterIds)) return res.status(400).json({ message: 'chapterIds must be an array' });

  const userId = req.user!.id;
  const resolvedStatus = status || (isLearned === false ? 'NOT_STARTED' : 'LEARNED');

  await Promise.all(chapterIds.map((chapterId: string) =>
    prisma.userChapter.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      update: { status: resolvedStatus },
      create: { userId, chapterId, status: resolvedStatus },
    })
  ));

  return res.json({ message: `${chapterIds.length} chapters marked` });
});

// Get user's learned chapters
router.get('/chapters/learned', authenticate, async (req: AuthRequest, res: Response) => {
  const chapters = await prisma.userChapter.findMany({
    where: { userId: req.user!.id, OR: [{ status: 'LEARNED' }, { isLearned: true }] },
    include: { chapter: { include: { subject: true } } },
  });
  return res.json(chapters);
});

export default router;
