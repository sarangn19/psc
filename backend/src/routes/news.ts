import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all news items
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { category } = req.query;

  const news = await prisma.newsItem.findMany({
    where: {
      isActive: true,
      ...(category ? { category: String(category) } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });
  return res.json(news);
});

// Mark news as viewed
router.post('/:newsId/view', authenticate, async (req: AuthRequest, res: Response) => {
  const { newsId } = req.params;
  const userId = req.user!.id;

  await prisma.newsView.upsert({
    where: { userId_newsItemId: { userId, newsItemId: newsId } },
    update: { viewedAt: new Date() },
    create: { userId, newsItemId: newsId },
  });

  await prisma.userActivity.create({
    data: { userId, type: 'NEWS_VIEWED', metadata: { newsId } },
  });

  return res.json({ ok: true });
});

// Get news categories
router.get('/categories', authenticate, async (_req, res: Response) => {
  const categories = await prisma.newsItem.groupBy({
    by: ['category'],
    where: { isActive: true },
    _count: true,
  });
  return res.json(categories);
});

export default router;
