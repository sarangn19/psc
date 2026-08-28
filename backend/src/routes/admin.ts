import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { normalizeOptions } from '../lib/options';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireAdmin);

// Dashboard overview stats
router.get('/stats', async (_req, res: Response) => {
  const [totalUsers, totalQuestions, totalAttempts, totalSessions, pendingReports] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.question.count({ where: { isActive: true } }),
    prisma.questionAttempt.count(),
    prisma.adaptiveSession.count(),
    prisma.questionReport.count({ where: { isResolved: false } }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeToday = await prisma.userActivity.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: today } },
    _count: true,
  });

  return res.json({
    totalUsers,
    totalQuestions,
    totalAttempts,
    totalSessions,
    pendingReports,
    activeTodayCount: activeToday.length,
  });
});

// All users list with basic stats
router.get('/users', async (_req, res: Response) => {
  const users = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    select: {
      id: true, name: true, email: true, createdAt: true,
      _count: {
        select: {
          attempts: true,
          adaptiveSessions: true,
          learnedChapters: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(users);
});

// Detailed user research: activity + performance
router.get('/users/:userId', async (req, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const [activities, attempts, sessions, learnedChapters, selectedExams] = await Promise.all([
    prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.questionAttempt.findMany({
      where: { userId },
      include: { question: { include: { chapter: { include: { subject: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.adaptiveSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.userChapter.findMany({
      where: { userId, isLearned: true },
      include: { chapter: { include: { subject: true } } },
    }),
    prisma.userExam.findMany({
      where: { userId },
      include: { exam: true },
    }),
  ]);

  // Performance by chapter
  const chapterMap = new Map<string, { name: string; subject: string; total: number; correct: number }>();
  for (const attempt of attempts) {
    const key = attempt.question.chapterId;
    if (!chapterMap.has(key)) {
      chapterMap.set(key, {
        name: attempt.question.chapter.name,
        subject: attempt.question.chapter.subject.name,
        total: 0, correct: 0,
      });
    }
    const e = chapterMap.get(key)!;
    e.total++;
    if (attempt.isCorrect) e.correct++;
  }

  const chapterPerformance = Array.from(chapterMap.entries()).map(([id, data]) => ({
    chapterId: id,
    ...data,
    accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
    zone: data.total >= 5
      ? (data.correct / data.total >= 0.7 ? 'STRONG' : data.correct / data.total >= 0.4 ? 'MEDIUM' : 'WEAK')
      : 'UNTESTED',
  }));

  const totalCorrect = attempts.filter((a) => a.isCorrect).length;

  return res.json({
    user,
    stats: {
      totalAttempts: attempts.length,
      totalCorrect,
      accuracy: attempts.length > 0 ? Math.round((totalCorrect / attempts.length) * 100) : 0,
      totalSessions: sessions.length,
      learnedChaptersCount: learnedChapters.length,
    },
    activities,
    sessions,
    chapterPerformance,
    learnedChapters,
    selectedExams: selectedExams.map((ue) => ue.exam),
  });
});

// Question reports
router.get('/reports', async (_req, res: Response) => {
  const reports = await prisma.questionReport.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      question: { include: { chapter: { include: { subject: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(reports);
});

// Resolve a report
router.patch('/reports/:reportId/resolve', async (req, res: Response) => {
  const { reportId } = req.params;
  const report = await prisma.questionReport.update({
    where: { id: reportId },
    data: { isResolved: true, resolvedAt: new Date() },
  });
  return res.json(report);
});

// Toggle question active status
router.patch('/questions/:questionId/toggle', async (req, res: Response) => {
  const { questionId } = req.params;
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) return res.status(404).json({ message: 'Question not found' });

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { isActive: !question.isActive },
  });
  return res.json(updated);
});

// Global performance by chapter (all users)
router.get('/analytics/chapters', async (_req, res: Response) => {
  const attempts = await prisma.questionAttempt.findMany({
    include: { question: { include: { chapter: { include: { subject: true } } } } },
  });

  const chapterMap = new Map<string, { name: string; subject: string; total: number; correct: number }>();
  for (const attempt of attempts) {
    const key = attempt.question.chapterId;
    if (!chapterMap.has(key)) {
      chapterMap.set(key, {
        name: attempt.question.chapter.name,
        subject: attempt.question.chapter.subject.name,
        total: 0, correct: 0,
      });
    }
    const e = chapterMap.get(key)!;
    e.total++;
    if (attempt.isCorrect) e.correct++;
  }

  const result = Array.from(chapterMap.entries()).map(([id, data]) => ({
    chapterId: id,
    ...data,
    accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
  }));

  return res.json(result);
});

// Add question (admin)
router.post('/questions', async (req, res: Response) => {
  const { chapterId, conceptId, text, options, correctOption, explanation, difficulty, tags } = req.body;

  const question = await prisma.question.create({
    data: {
      chapterId,
      conceptId: conceptId || null,
      text,
      options: normalizeOptions(options),
      correctOption,
      explanation,
      difficulty,
      tags: tags || [],
    },
  });
  return res.status(201).json(question);
});

// Question bank: list with filters + pagination (admin review)
router.get('/questions', async (req: AuthRequest, res: Response) => {
  const { search, chapterId, conceptId, level, status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const where: any = {};
  if (chapterId && String(chapterId).trim()) where.chapterId = String(chapterId);
  if (conceptId && String(conceptId).trim()) where.conceptId = Number(conceptId);
  if (level && String(level).trim()) where.concept = { level: String(level).toUpperCase() };
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;
  const q = String(search || '').trim();
  if (q) {
    where.OR = [
      { text: { contains: q, mode: 'insensitive' } },
      { explanation: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, raw] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        chapter: { include: { subject: { include: { exam: true } } } },
        concept: { select: { id: true, parentId: true, level: true, nameEnglish: true } },
      },
    }),
  ]);

  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, parentId: true, level: true, nameEnglish: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const pathOf = (id: number) => {
    const path: { id: number; level: string; nameEnglish: string }[] = [];
    let cur = nodeById.get(id);
    while (cur) { path.unshift({ id: cur.id, level: cur.level, nameEnglish: cur.nameEnglish }); cur = cur.parentId != null ? nodeById.get(cur.parentId) : undefined; }
    return path;
  };

  const items = raw.map((q) => ({
    id: q.id, text: q.text, options: normalizeOptions(q.options), correctOption: q.correctOption,
    explanation: q.explanation, difficulty: q.difficulty, tags: q.tags, isActive: q.isActive, createdAt: q.createdAt,
    chapter: { id: q.chapter.id, name: q.chapter.name, subject: q.chapter.subject.name, exam: q.chapter.subject.exam.name },
    concept: q.concept ? { id: q.concept.id, level: q.concept.level, nameEnglish: q.concept.nameEnglish } : null,
    conceptPath: q.concept ? pathOf(q.concept.id) : [],
  }));

  return res.json({ items, total, page, pageSize });
});

// Update a question (edit fields + taxonomy + flag via isActive)
router.patch('/questions/:questionId', async (req: AuthRequest, res: Response) => {
  const { questionId } = req.params;
  const existing = await prisma.question.findUnique({ where: { id: questionId } });
  if (!existing) return res.status(404).json({ message: 'Question not found' });

  const { chapterId, conceptId, text, options, correctOption, explanation, difficulty, tags, isActive } = req.body;
  const data: any = {};

  if (typeof text === 'string' && text.trim()) data.text = text.trim();
  if (options !== undefined) {
    const opts = normalizeOptions(options);
    if (!opts.length) return res.status(400).json({ message: 'At least one option is required' });
    data.options = opts;
    const co = correctOption === undefined ? Number(existing.correctOption) : Number(correctOption);
    if (!(Number.isInteger(co) && co >= 0 && co < opts.length)) return res.status(400).json({ message: 'Invalid correctOption' });
    data.correctOption = co;
  } else if (correctOption !== undefined) {
    const co = Number(correctOption);
    const opts = normalizeOptions(existing.options);
    if (!(Number.isInteger(co) && co >= 0 && co < opts.length)) return res.status(400).json({ message: 'Invalid correctOption' });
    data.correctOption = co;
  }
  if (chapterId !== undefined && String(chapterId).trim()) data.chapterId = String(chapterId);
  if (conceptId !== undefined) {
    const cid = conceptId === null || conceptId === '' ? null : Number(conceptId);
    if (cid !== null) {
      const node = await prisma.taxonomyNode.findUnique({ where: { id: cid } });
      if (!node) return res.status(400).json({ message: 'Concept not found' });
    }
    data.conceptId = cid;
  }
  if (explanation !== undefined) data.explanation = explanation;
  if (difficulty !== undefined) data.difficulty = difficulty;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : [];
  if (typeof isActive === 'boolean') data.isActive = isActive;

  const updated = await prisma.question.update({ where: { id: questionId }, data });
  return res.json(updated);
});

// Delete a question (removes its dependent attempts/reports/adaptive items)
router.delete('/questions/:questionId', async (req: AuthRequest, res: Response) => {
  const { questionId } = req.params;
  const existing = await prisma.question.findUnique({ where: { id: questionId } });
  if (!existing) return res.status(404).json({ message: 'Question not found' });

  await prisma.$transaction([
    prisma.adaptiveItem.deleteMany({ where: { questionId } }),
    prisma.questionAttempt.deleteMany({ where: { questionId } }),
    prisma.questionReport.deleteMany({ where: { questionId } }),
    prisma.question.delete({ where: { id: questionId } }),
  ]);
  return res.json({ ok: true });
});

// Add news item
router.post('/news', async (req, res: Response) => {
  const { title, content, category, source } = req.body;
  const news = await prisma.newsItem.create({ data: { title, content, category, source } });
  return res.status(201).json(news);
});

// Generate daily current affairs via AI
router.post('/news/generate-daily', async (req: AuthRequest, res: Response) => {
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_KEY) return res.status(500).json({ error: 'No API key configured' });

  const today = new Date().toISOString().split('T')[0];

  // Check existing count for today
  const todayCount = await prisma.newsItem.count({
    where: {
      publishedAt: { gte: new Date(today), lt: new Date(new Date(today).getTime() + 86400000) },
    },
  });
  if (todayCount >= 10) {
    return res.json({ message: `Already have ${todayCount} items for today`, inserted: 0 });
  }

  const CATEGORIES = ['Current Affairs', 'Kerala State News', 'National News', 'International News', 'PSC Notifications', 'Education', 'Awards & Recognition', 'Government Schemes'];

  const prompt = `Generate 15 current affairs news items relevant for Kerala PSC exam preparation for today ${today}.

Return ONLY a JSON array. Each element:
{"title":"headline","content":"2-3 sentence detail","category":"Current Affairs","source":"Source Name"}

Categories: Current Affairs, Kerala State News, National News, International News, PSC Notifications, Education, Awards & Recognition, Government Schemes.

Rules: unique titles, factual, exam-relevant, specific names/dates/facts, no markdown, mix categories.`;

  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!aiRes.ok) return res.status(500).json({ error: 'AI request failed' });

  const data: any = await aiRes.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) return res.status(500).json({ error: 'Invalid AI response' });

  const items = JSON.parse(raw.substring(start, end + 1));
  const valid = items.filter((item: any) => item.title && item.content && CATEGORIES.includes(item.category));

  let inserted = 0;
  for (const item of valid) {
    try {
      await prisma.newsItem.create({
        data: {
          title: String(item.title).slice(0, 500),
          content: String(item.content).slice(0, 2000),
          category: item.category,
          source: String(item.source || 'Daily Current Affairs'),
          publishedAt: new Date(),
          isActive: true,
        },
      });
      inserted++;
    } catch (e: any) {
      if (e.code === 'P2002') continue;
    }
  }

  return res.json({ message: `Inserted ${inserted} news items`, inserted });
});

export default router;
