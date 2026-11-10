import { Router, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../lib/prisma';
import { normalizeOptions } from '../lib/options';
import { loadReviewStore, saveReviewStore } from '../services/qbiReviewStore';
import { loadSemanticStore, saveSemanticStore } from '../services/qbiSemanticStore';
import { loadCheckpoint, saveCheckpoint } from '../services/qbiDiscoveryCheckpoint';
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
    prisma.questionReport.count({ where: { status: { not: 'RESOLVED' } } }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeToday = await prisma.userActivity.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: today } },
    _count: { id: true },
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
      where: { userId, OR: [{ status: 'LEARNED' }, { isLearned: true }] },
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

// Question reports — enhanced with AI investigation data and admin actions
router.get('/reports', async (req, res: Response) => {
  const {
    status,
    aiStatus,
    severity,
    category,
    examId,
    subjectId,
    chapterId,
    dateFrom,
    dateTo,
    page = '1',
    pageSize = '25',
  } = req.query;

  const where: any = {};

  if (status) where.status = status;
  if (aiStatus) where.aiStatus = aiStatus;
  if (severity) where.aiSeverity = severity;
  if (category) where.category = category;

  if (examId || subjectId || chapterId) {
    where.question = {};
    if (chapterId) where.question.chapterId = String(chapterId);
    if (subjectId) where.question.chapter = { subjectId: String(subjectId) };
    if (examId) where.question.chapter = { subject: { examId: String(examId) } };
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(String(dateFrom));
    if (dateTo) where.createdAt.lte = new Date(String(dateTo));
  }

  const p = Math.max(1, Number(page));
  const ps = Math.min(100, Math.max(1, Number(pageSize)));

  const [total, reports] = await Promise.all([
    prisma.questionReport.count({ where }),
    prisma.questionReport.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        question: {
          include: {
            chapter: { include: { subject: { include: { exam: true } } } },
            concept: { select: { id: true, nameEnglish: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * ps,
      take: ps,
    }),
  ]);

  // Get report counts per question for grouping
  const questionIds = [...new Set(reports.map((r) => r.questionId))];
  const reportCounts = await prisma.questionReport.groupBy({
    by: ['questionId'],
    where: { questionId: { in: questionIds } },
    _count: { id: true },
  });
  const countMap = new Map(reportCounts.map((rc) => [rc.questionId, rc._count.id]));

  return res.json({
    items: reports.map((r) => ({
      ...r,
      reportCount: countMap.get(r.questionId) || 1,
    })),
    total,
    page: p,
    pageSize: ps,
  });
});

// Get single report with full details
router.get('/reports/:reportId', async (req, res: Response) => {
  const { reportId } = req.params;

  const report = await prisma.questionReport.findUnique({
    where: { id: reportId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      question: {
        include: {
          chapter: { include: { subject: { include: { exam: true } } } },
          concept: { select: { id: true, nameEnglish: true } },
        },
      },
    },
  });

  if (!report) return res.status(404).json({ message: 'Report not found' });

  // Get all reports for the same question
  const relatedReports = await prisma.questionReport.findMany({
    where: { questionId: report.questionId, id: { not: reportId } },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ report, relatedReports });
});

// Admin actions on reports
router.patch('/reports/:reportId/action', async (req, res: Response) => {
  const { reportId } = req.params;
  const { action, notes } = req.body;

  const report = await prisma.questionReport.findUnique({ where: { id: reportId } });
  if (!report) return res.status(404).json({ message: 'Report not found' });

  const allowedActions = [
    'CONFIRM_ISSUE',
    'REJECT_REPORT',
    'REQUEST_FURTHER_INVESTIGATION',
    'MARK_RESOLVED',
    'APPROVE_CORRECTION',
    'DISMISS_DUPLICATE',
  ];

  if (!allowedActions.includes(action)) {
    return res.status(400).json({ message: 'Invalid action' });
  }

  let updateData: any = { resolutionNotes: notes?.slice(0, 2000) };

  switch (action) {
    case 'CONFIRM_ISSUE':
      updateData.status = 'RESOLVED';
      updateData.resolvedAt = new Date();
      updateData.aiStatus = 'AUTO_CONFIRMED';
      break;
    case 'REJECT_REPORT':
      updateData.status = 'DISMISSED';
      updateData.resolvedAt = new Date();
      updateData.aiStatus = 'AUTO_REJECTED';
      break;
    case 'REQUEST_FURTHER_INVESTIGATION':
      updateData.status = 'NEEDS_REVIEW';
      updateData.aiStatus = 'NEEDS_REVIEW';
      updateData.aiRequiresHumanReview = true;
      break;
    case 'MARK_RESOLVED':
      updateData.status = 'RESOLVED';
      updateData.resolvedAt = new Date();
      break;
    case 'APPROVE_CORRECTION':
      updateData.status = 'RESOLVED';
      updateData.resolvedAt = new Date();
      // Note: Actual question correction would go through a separate workflow
      break;
    case 'DISMISS_DUPLICATE':
      updateData.status = 'DISMISSED';
      updateData.resolvedAt = new Date();
      break;
  }

  const updated = await prisma.questionReport.update({
    where: { id: reportId },
    data: updateData,
  });

  return res.json(updated);
});

// Re-run AI investigation for a report
router.post('/reports/:reportId/reinvestigate', async (req, res: Response) => {
  const { reportId } = req.params;

  const report = await prisma.questionReport.findUnique({
    where: { id: reportId },
    include: {
      question: {
        include: {
          chapter: { include: { subject: { include: { exam: true } } } },
          concept: { select: { id: true, nameEnglish: true } },
        },
      },
    },
  });

  if (!report) return res.status(404).json({ message: 'Report not found' });

  // Reset AI status and trigger investigation
  await prisma.questionReport.update({
    where: { id: reportId },
    data: { aiStatus: 'SUBMITTED', aiError: null },
  });

  // Import and call investigateReport (we'll need to export it)
  const { investigateReport } = await import('../routes/reports');
  investigateReport(reportId).catch((err) => {
    console.error(`Re-investigation failed for report ${reportId}:`, err);
  });

  return res.json({ message: 'Re-investigation queued' });
});

// Report statistics for dashboard
router.get('/reports/stats', async (_req, res: Response) => {
  const [
    total,
    byStatus,
    byAiStatus,
    byCategory,
    bySeverity,
    topReportedQuestions,
  ] = await Promise.all([
    prisma.questionReport.count(),
    prisma.questionReport.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.questionReport.groupBy({ by: ['aiStatus'], _count: { id: true } }),
    prisma.questionReport.groupBy({ by: ['category'], _count: { id: true } }),
    prisma.questionReport.groupBy({ by: ['aiSeverity'], _count: { id: true } }),
    prisma.questionReport.groupBy({
      by: ['questionId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
  ]);

  const topQuestionIds = topReportedQuestions.map((r) => r.questionId);
  const topQuestions = topQuestionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: topQuestionIds } },
        select: { id: true, text: true, chapter: { select: { name: true, subject: { select: { name: true } } } } },
      })
    : [];

  const questionTextMap = new Map(topQuestions.map((q) => [q.id, { text: q.text.slice(0, 100), chapter: q.chapter }]));

  return res.json({
    total,
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    byAiStatus: byAiStatus.map((s) => ({ aiStatus: s.aiStatus, count: s._count.id })),
    byCategory: byCategory.map((c) => ({ category: c.category, count: c._count.id })),
    bySeverity: bySeverity.filter((s) => s.aiSeverity).map((s) => ({ severity: s.aiSeverity, count: s._count.id })),
    topReportedQuestions: topReportedQuestions.map((r) => ({
      questionId: r.questionId,
      reportCount: r._count.id,
      ...questionTextMap.get(r.questionId),
    })),
  });
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

  const conceptIdsOnPage = [...new Set(raw.filter((q) => q.concept).map((q) => q.concept!.id))];
  const nodes = await prisma.taxonomyNode.findMany({ where: { id: { in: conceptIdsOnPage } }, select: { id: true, parentId: true, level: true, nameEnglish: true } });
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

// Generate MCQs from today's current affairs
router.post('/news/generate-mcqs', async (req: AuthRequest, res: Response) => {
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_KEY) return res.status(500).json({ error: 'No API key configured' });

  const today = new Date().toISOString().split('T')[0];
  const dateTag = `current-affairs-${today}`;

  // Check if MCQs already generated
  const existing = await prisma.question.count({ where: { tags: { has: dateTag } } });
  if (existing > 0) return res.json({ message: `Already have ${existing} MCQs for today`, inserted: 0 });

  // Get today's news
  const newsItems = await prisma.newsItem.findMany({
    where: { publishedAt: { gte: new Date(today), lt: new Date(new Date(today).getTime() + 86400000) } },
    orderBy: { publishedAt: 'desc' },
  });
  if (newsItems.length === 0) return res.status(400).json({ error: 'No news items for today. Generate news first.' });

  const newsContext = newsItems.map((n, i) => `${i + 1}. [${n.category}] ${n.title}: ${n.content}`).join('\n');

  const prompt = `Based on these current affairs from ${today}, generate 20 MCQ questions for Kerala PSC exam preparation.

NEWS:
${newsContext}

Return ONLY a JSON array. Each element:
{"text":"question","options":["A","B","C","D"],"correctOption":<0-3>,"explanation":"brief","difficulty":"MEDIUM"}

Rules: directly based on news facts, specific names/dates/places, 4 options, 1 correct, mix difficulties, no markdown. IMPORTANT: Randomize correctOption across all values 0, 1, 2, 3 — do NOT always use 0.`;

  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'meta-llama/llama-3.1-8b-instruct', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096 }),
  });
  if (!aiRes.ok) return res.status(500).json({ error: 'AI request failed' });

  const data: any = await aiRes.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) return res.status(500).json({ error: 'Invalid AI response' });

  const items = JSON.parse(raw.substring(start, end + 1));
  const valid = items.filter((item: any) => item.text && item.options?.length === 4 && typeof item.correctOption === 'number');

  // Find or create Current Affairs chapter
  let chapter = await prisma.chapter.findFirst({ where: { name: 'Daily Current Affairs' } });
  if (!chapter) {
    let subject = await prisma.subject.findFirst({ where: { name: 'Current Affairs' } });
    if (!subject) {
      const exam = await prisma.exam.findFirst({ where: { name: { contains: 'PSC' } } });
      subject = await prisma.subject.create({ data: { name: 'Current Affairs', examId: exam?.id || '' } });
    }
    chapter = await prisma.chapter.create({ data: { name: 'Daily Current Affairs', subjectId: subject.id } });
  }

  const batch = valid.map((item: any) => ({
    chapterId: chapter!.id,
    text: String(item.text).slice(0, 2000),
    options: item.options.map((o: string) => String(o).slice(0, 500)),
    correctOption: item.correctOption,
    explanation: String(item.explanation || '').slice(0, 1000),
    difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(item.difficulty) ? item.difficulty : 'MEDIUM',
    tags: [dateTag, 'current-affairs', today],
    isActive: true,
  }));

  let inserted = 0;
  for (let i = 0; i < batch.length; i += 50) {
    const chunk = batch.slice(i, i + 50);
    await prisma.question.createMany({ data: chunk, skipDuplicates: true });
    inserted += chunk.length;
  }

  return res.json({ message: `Inserted ${inserted} current affairs MCQs`, inserted });
});

// ── Question Bank Intelligence (read-only, from audit artifacts) ──────────────
const QBI_ROOT = path.resolve(__dirname, '..', '..', '..');
const qbiCache = new Map<string, any>();

function loadQbiJson(name: string): any {
  if (qbiCache.has(name)) return qbiCache.get(name);
  const filePath = path.join(QBI_ROOT, name);
  if (!fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  qbiCache.set(name, data);
  return data;
}

router.get('/question-bank/summary', async (_req: AuthRequest, res: Response) => {
  const summary = loadQbiJson('question_bank_audit_summary.json');
  const recovery = loadQbiJson('question_bank_recovery_summary.json');
  if (!summary) return res.status(404).json({ error: 'Audit summary not found' });
  return res.json({ summary, recovery });
});

router.get('/question-bank/records', async (req: AuthRequest, res: Response) => {
  const audit = loadQbiJson('complete_question_bank_audit.json');
  if (!audit) return res.status(404).json({ error: 'Audit data not found' });

  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));
  const status = req.query.status ? String(req.query.status) : null;
  const conceptStatus = req.query.conceptStatus ? String(req.query.conceptStatus) : null;
  const suspicious = req.query.suspicious === 'true' ? true : req.query.suspicious === 'false' ? false : null;
  const dbDup = req.query.dbDup === 'true' ? true : req.query.dbDup === 'false' ? false : null;
  const search = req.query.search ? String(req.query.search).toLowerCase() : null;

  let filtered = audit as any[];
  if (status) filtered = filtered.filter((r) => r.status === status);
  if (conceptStatus) filtered = filtered.filter((r) => r.conceptStatus === conceptStatus);
  if (suspicious !== null) filtered = filtered.filter((r) => r.suspicious === suspicious);
  if (dbDup !== null) filtered = filtered.filter((r) => r.databaseDuplicate === dbDup);
  if (search) filtered = filtered.filter((r) => String(r.question || '').toLowerCase().includes(search));

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((r) => ({
    excelRow: r.excelRow,
    question: r.question,
    optionCount: r.validOptionCount,
    answerStatus: r.answerStatus,
    normalizedAnswer: r.normalizedAnswerLetter,
    conceptId: r.conceptId,
    conceptStatus: r.conceptStatus,
    topic: r.topic,
    source: r.source,
    hasExplanation: r.hasExplanation,
    suspicious: r.suspicious,
    sourceDuplicate: r.sourceDuplicate,
    databaseDuplicate: r.databaseDuplicate,
    status: r.status,
  }));

  return res.json({ total, page, pageSize, items });
});

router.get('/question-bank/record/:row', async (req: AuthRequest, res: Response) => {
  const audit = loadQbiJson('complete_question_bank_audit.json');
  if (!audit) return res.status(404).json({ error: 'Audit data not found' });
  const row = Number(req.params.row);
  const record = (audit as any[]).find((r) => r.excelRow === row);
  if (!record) return res.status(404).json({ error: 'Record not found' });
  return res.json(record);
});

router.get('/question-bank/manifest', async (_req: AuthRequest, res: Response) => {
  const manifest = loadQbiJson('final_import_manifest.json');
  if (!manifest) return res.status(404).json({ error: 'Manifest not found' });
  return res.json({ count: manifest.length, items: manifest });
});

// ── Question Bank Content Review (file-backed; DB migration proposed separately) ──
function loadReviews(): any {
  try {
    return loadReviewStore();
  } catch {
    return { reviews: {} };
  }
}

function saveReviews(data: any) {
  saveReviewStore(data);
}

function reviewCategory(r: any): string {
  if (r.suspicious) return 'suspicious';
  if (r.answerStatus === 'missing') return 'missing_answer';
  if (r.answerStatus === 'invalid') return 'invalid_answer';
  if (r.answerStatus === 'conflicting') return 'conflicting_answer';
  if (r.validOptionCount < 4) return 'missing_options';
  if (r.status === 'INVALID_QUESTION') return 'invalid_question';
  if (r.sourceDuplicate || r.databaseDuplicate) return 'duplicate';
  if (!r.hasExplanation) return 'missing_explanation';
  return 'other';
}

router.get('/question-bank/review-queue', async (req: AuthRequest, res: Response) => {
  const audit = loadQbiJson('complete_question_bank_audit.json');
  if (!audit) return res.status(404).json({ error: 'Audit data not found' });
  const reviews = loadReviews();
  const category = req.query.category ? String(req.query.category) : null;
  const reviewStatus = req.query.reviewStatus ? String(req.query.reviewStatus) : null;
  const search = req.query.search ? String(req.query.search).toLowerCase() : null;
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));

  let filtered = (audit as any[]).map((r) => {
    const rev = reviews.reviews?.[String(r.excelRow)];
    return { ...r, reviewStatus: rev?.status || 'pending', reviewNotes: rev?.notes || null, reviewerId: rev?.reviewerId || null, reviewedAt: rev?.updatedAt || null };
  });

  if (category) filtered = filtered.filter((r) => reviewCategory(r) === category);
  if (reviewStatus) filtered = filtered.filter((r) => r.reviewStatus === reviewStatus);
  if (search) filtered = filtered.filter((r) => String(r.question || '').toLowerCase().includes(search));

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((r) => ({
    excelRow: r.excelRow,
    question: r.question,
    optionCount: r.validOptionCount,
    answerStatus: r.answerStatus,
    normalizedAnswer: r.normalizedAnswerLetter,
    conceptId: r.conceptId,
    conceptStatus: r.conceptStatus,
    topic: r.topic,
    source: r.source,
    hasExplanation: r.hasExplanation,
    suspicious: r.suspicious,
    status: r.status,
    reviewCategory: reviewCategory(r),
    reviewStatus: r.reviewStatus,
    reviewNotes: r.reviewNotes,
    reviewedAt: r.reviewedAt,
  }));

  return res.json({ total, page, pageSize, items });
});

router.get('/question-bank/review/:row', async (req: AuthRequest, res: Response) => {
  const audit = loadQbiJson('complete_question_bank_audit.json');
  if (!audit) return res.status(404).json({ error: 'Audit data not found' });
  const row = Number(req.params.row);
  const record = (audit as any[]).find((r) => r.excelRow === row);
  if (!record) return res.status(404).json({ error: 'Record not found' });
  const reviews = loadReviews();
  const review = reviews.reviews?.[String(row)] || null;
  return res.json({ record, review, reviewCategory: reviewCategory(record) });
});

router.post('/question-bank/review/:row', async (req: AuthRequest, res: Response) => {
  const audit = loadQbiJson('complete_question_bank_audit.json');
  if (!audit) return res.status(404).json({ error: 'Audit data not found' });
  const row = Number(req.params.row);
  const record = (audit as any[]).find((r) => r.excelRow === row);
  if (!record) return res.status(404).json({ error: 'Record not found' });

  const { action, notes, edited } = req.body || {};
  const allowed = ['approve', 'reject', 'edit_approve', 'investigate', 'skip'];
  if (!allowed.includes(action)) return res.status(400).json({ error: 'Invalid action' });

  const statusMap: Record<string, string> = {
    approve: 'approved',
    reject: 'rejected',
    edit_approve: 'edited_approved',
    investigate: 'needs_investigation',
    skip: 'skipped',
  };

  const reviews = loadReviews();
  if (!reviews.reviews) reviews.reviews = {};
  const prev = reviews.reviews[String(row)] || null;
  const now = new Date().toISOString();
  const entry: any = {
    row,
    status: statusMap[action],
    action,
    notes: notes ? String(notes).slice(0, 2000) : null,
    reviewerId: req.user!.id,
    previousStatus: prev?.status || 'pending',
    editedData: edited || null,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    history: prev?.history ? [...prev.history] : [],
  };
  entry.history.push({ action, status: statusMap[action], notes: entry.notes, reviewerId: req.user!.id, at: now });
  reviews.reviews[String(row)] = entry;
  saveReviews(reviews);

  return res.json({ ok: true, review: entry });
});

router.get('/question-bank/review/:row/history', async (req: AuthRequest, res: Response) => {
  const reviews = loadReviews();
  const row = Number(req.params.row);
  const review = reviews.reviews?.[String(row)];
  return res.json({ row, history: review?.history || [] });
});

// ── Taxonomy Intelligence (read-only) ────────────────────────────────────────
let taxonomyCache: any = null;
let conceptQuestionCountCache: Map<number, number> | null = null;

async function getTaxonomyNodes(): Promise<any[]> {
  if (taxonomyCache) return taxonomyCache;
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, level: true, parentId: true } });
  const byId = new Map(nodes.map((n: any) => [n.id, n]));
  taxonomyCache = nodes.map((n: any) => {
    // walk parent chain
    const chain: any[] = [];
    let cur = n;
    const seen = new Set();
    while (cur && cur.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      chain.unshift(parent);
      cur = parent;
    }
    const exam = chain.find((x: any) => x.level === 'EXAM')?.nameEnglish || null;
    const subject = chain.find((x: any) => x.level === 'SUBJECT')?.nameEnglish || null;
    const domain = chain.find((x: any) => x.level === 'DOMAIN')?.nameEnglish || null;
    const topic = chain.find((x: any) => x.level === 'TOPIC')?.nameEnglish || null;
    return { ...n, exam, subject, domain, topic, parentChain: chain.map((x: any) => ({ id: x.id, name: x.nameEnglish, level: x.level })) };
  });
  return taxonomyCache;
}

async function getConceptQuestionCounts(): Promise<Map<number, number>> {
  if (conceptQuestionCountCache) return conceptQuestionCountCache;
  const rows = await prisma.question.groupBy({ by: ['conceptId'], _count: { id: true } });
  const m = new Map<number, number>();
  for (const r of rows) {
    if (r.conceptId !== null && r.conceptId !== undefined) m.set(r.conceptId, r._count.id);
  }
  conceptQuestionCountCache = m;
  return m;
}

const mappingAuditCache = (() => {
  try {
    return JSON.parse(require('node:fs').readFileSync(path.join(QBI_ROOT, 'recovered_taxonomy_mappings.json'), 'utf8'));
  } catch {
    return [];
  }
})();

function mappingStatusFor(conceptId: number): any {
  const entry = (mappingAuditCache as any[]).find((m: any) => m.conceptId === conceptId);
  if (!entry) return { status: 'NOT_IN_SOURCE', relationships: [], rowCount: 0 };
  return { status: entry.status, relationships: entry.relationships || [], rowCount: entry.rowCount || 0 };
}

router.get('/taxonomy/summary', async (_req: AuthRequest, res: Response) => {
  const nodes = await getTaxonomyNodes();
  const counts = { EXAM: 0, SUBJECT: 0, DOMAIN: 0, TOPIC: 0, CONCEPT: 0 };
  for (const n of nodes) if (counts[n.level as keyof typeof counts] !== undefined) counts[n.level as keyof typeof counts]++;
  const mappingAudit = mappingAuditCache as any[];
  const mappingCounts = { VERIFIED: 0, AMBIGUOUS: 0, UNMAPPED: 0, INVALID: 0, NOT_IN_SOURCE: 0 };
  for (const n of nodes) {
    if (n.level !== 'CONCEPT') continue;
    const st = mappingStatusFor(n.id).status;
    if (Object.prototype.hasOwnProperty.call(mappingCounts, st)) (mappingCounts as any)[st]++;
    else (mappingCounts as any).NOT_IN_SOURCE++;
  }
  // question coverage by level? concepts with questions
  const qCounts = await getConceptQuestionCounts();
  const conceptsWithQuestions = [...qCounts.keys()].filter((id) => nodes.some((n: any) => n.id === id && n.level === 'CONCEPT')).length;
  return res.json({
    totals: { exams: counts.EXAM, subjects: counts.SUBJECT, domains: counts.DOMAIN, topics: counts.TOPIC, concepts: counts.CONCEPT },
    mappingCounts,
    auditConcepts: mappingAudit.length,
    conceptsWithQuestions,
    totalConceptQuestionLinks: [...qCounts.values()].reduce((a, b) => a + b, 0),
  });
});

router.get('/taxonomy/concepts', async (req: AuthRequest, res: Response) => {
  const nodes = await getTaxonomyNodes();
  const qCounts = await getConceptQuestionCounts();
  const level = req.query.level ? String(req.query.level) : 'CONCEPT';
  const search = req.query.search ? String(req.query.search).toLowerCase() : null;
  const mappingStatus = req.query.mappingStatus ? String(req.query.mappingStatus) : null;
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));

  let filtered = nodes.filter((n: any) => (level ? n.level === level : true));
  if (search) filtered = filtered.filter((n: any) => String(n.nameEnglish || '').toLowerCase().includes(search));
  if (mappingStatus) filtered = filtered.filter((n: any) => mappingStatusFor(n.id).status === mappingStatus);

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((n: any) => {
    const ms = mappingStatusFor(n.id);
    return {
      id: n.id,
      name: n.nameEnglish,
      level: n.level,
      parentId: n.parentId,
      exam: n.exam,
      subject: n.subject,
      domain: n.domain,
      topic: n.topic,
      questionCount: qCounts.get(n.id) || 0,
      mappingStatus: ms.status,
      mappingRowCount: ms.rowCount,
      relationshipCount: ms.relationships?.length || 0,
    };
  });
  return res.json({ total, page, pageSize, items });
});

router.get('/taxonomy/concept/:id', async (req: AuthRequest, res: Response) => {
  const nodes = await getTaxonomyNodes();
  const id = Number(req.params.id);
  const node = nodes.find((n: any) => n.id === id);
  if (!node) return res.status(404).json({ error: 'Concept not found' });
  const qCounts = await getConceptQuestionCounts();
  const ms = mappingStatusFor(id);
  // sample questions
  const samples = await prisma.question.findMany({ where: { conceptId: id }, select: { id: true, text: true, correctOption: true, options: true }, take: 5 });
  return res.json({
    id: node.id,
    name: node.nameEnglish,
    level: node.level,
    parentId: node.parentId,
    exam: node.exam,
    subject: node.subject,
    domain: node.domain,
    topic: node.topic,
    parentChain: node.parentChain,
    questionCount: qCounts.get(id) || 0,
    mappingStatus: ms.status,
    relationships: ms.relationships || [],
    mappingRowCount: ms.rowCount || 0,
    sampleQuestions: samples,
  });
});

router.get('/taxonomy/mappings', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));
  const status = req.query.status ? String(req.query.status) : null;
  const search = req.query.search ? String(req.query.search).toLowerCase() : null;

  let filtered = mappingAuditCache as any[];
  if (status) filtered = filtered.filter((m: any) => m.status === status);
  if (search) filtered = filtered.filter((m: any) => String(m.node || '').toLowerCase().includes(search) || String(m.conceptId).includes(search));

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return res.json({ total, page, pageSize, items });
});

// ── Taxonomy Concept Discovery (deterministic, read-only) ───────────────────
let discoveryCache: any = null;

async function getDiscoveryGroups() {
  if (discoveryCache) return discoveryCache;
  const nodes = await getTaxonomyNodes();
  const qCounts = await getConceptQuestionCounts();

  // exact name duplicates
  const exactMap = new Map<string, any[]>();
  for (const n of nodes) {
    if (n.level !== 'CONCEPT') continue;
    const key = n.nameEnglish;
    if (!exactMap.has(key)) exactMap.set(key, []);
    exactMap.get(key)!.push(n);
  }
  const exactGroups = [...exactMap.entries()].filter(([k, v]) => v.length > 1).map(([k, v]) => ({
    type: 'exact_duplicate',
    key: k,
    conceptIds: v.map((n: any) => n.id),
    concepts: v.map((n: any) => ({ id: n.id, name: n.nameEnglish, subject: n.subject, topic: n.topic, questionCount: qCounts.get(n.id) || 0 })),
  }));

  // normalized name duplicates
  const normMap = new Map<string, any[]>();
  for (const n of nodes) {
    if (n.level !== 'CONCEPT') continue;
    const key = String(n.nameEnglish || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!key) continue;
    if (!normMap.has(key)) normMap.set(key, []);
    normMap.get(key)!.push(n);
  }
  const normalizedGroups = [...normMap.entries()].filter(([k, v]) => v.length > 1).map(([k, v]) => ({
    type: 'normalized_duplicate',
    key: k,
    conceptIds: v.map((n: any) => n.id),
    concepts: v.map((n: any) => ({ id: n.id, name: n.nameEnglish, subject: n.subject, topic: n.topic, questionCount: qCounts.get(n.id) || 0 })),
  }));

  // same-topic siblings (potential related concepts)
  const topicMap = new Map<number, any[]>();
  for (const n of nodes) {
    if (n.level !== 'CONCEPT' || !n.parentId) continue;
    if (!topicMap.has(n.parentId)) topicMap.set(n.parentId, []);
    topicMap.get(n.parentId)!.push(n);
  }
  const siblingGroups = [...topicMap.entries()]
    .filter(([k, v]) => v.length >= 2 && v.length <= 25)
    .map(([k, v]) => ({
      type: 'same_topic_siblings',
      key: `topic:${k}`,
      conceptIds: v.map((n: any) => n.id),
      concepts: v.map((n: any) => ({ id: n.id, name: n.nameEnglish, subject: n.subject, topic: n.topic, questionCount: qCounts.get(n.id) || 0 })),
    }));

  discoveryCache = { exactGroups, normalizedGroups, siblingGroups };
  return discoveryCache;
}

router.get('/taxonomy/discovery/summary', async (_req: AuthRequest, res: Response) => {
  const g = await getDiscoveryGroups();
  return res.json({
    exactDuplicateGroups: g.exactGroups.length,
    exactDuplicateConcepts: g.exactGroups.reduce((a: number, x: any) => a + x.conceptIds.length, 0),
    normalizedDuplicateGroups: g.normalizedGroups.length,
    normalizedDuplicateConcepts: g.normalizedGroups.reduce((a: number, x: any) => a + x.conceptIds.length, 0),
    siblingGroups: g.siblingGroups.length,
    siblingConcepts: g.siblingGroups.reduce((a: number, x: any) => a + x.conceptIds.length, 0),
  });
});

router.get('/taxonomy/discovery/groups', async (req: AuthRequest, res: Response) => {
  const g = await getDiscoveryGroups();
  const type = req.query.type ? String(req.query.type) : 'normalized_duplicate';
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));
  const groups = type === 'exact' ? g.exactGroups : type === 'siblings' ? g.siblingGroups : g.normalizedGroups;
  const total = groups.length;
  const start = (page - 1) * pageSize;
  const items = groups.slice(start, start + pageSize);
  return res.json({ total, page, pageSize, items });
});

// ── Taxonomy Semantic Discovery (AI-assisted, read-only taxonomy) ─────────────
router.post('/taxonomy/discovery/semantic', async (req: AuthRequest, res: Response) => {
  const conceptId = Number(req.body?.conceptId);
  if (!Number.isInteger(conceptId)) return res.status(400).json({ error: 'conceptId required' });
  const limit = Math.min(10, Math.max(1, Number(req.body?.limit || 5)));

  const nodes = await getTaxonomyNodes();
  const primary = nodes.find((n: any) => n.id === conceptId && n.level === 'CONCEPT');
  if (!primary) return res.status(404).json({ error: 'Concept not found' });

  const siblings = nodes.filter((n: any) => n.level === 'CONCEPT' && n.parentId === primary.parentId && n.id !== conceptId).slice(0, limit);
  if (siblings.length === 0) return res.json({ suggestions: [], message: 'No candidate siblings found' });

  // sample questions
  async function samples(id: number) {
    const qs = await prisma.question.findMany({ where: { conceptId: id }, select: { text: true }, take: 2 });
    return qs.map((q: any) => String(q.text).slice(0, 120));
  }
  const primarySamples = await samples(conceptId);

  const apiKey = process.env.GROQ_API_KEY || process.env.AI_FALLBACK_API_KEY;
  const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
  if (!apiKey) return res.status(500).json({ error: 'Groq API key not configured' });

  const candidateLines = await Promise.all(siblings.map(async (sib: any) => {
    const ss = await samples(sib.id);
    return `Concept ${sib.id}: "${sib.nameEnglish}" | topic: ${sib.topic || 'n/a'} | subject: ${sib.subject || 'n/a'} | questions: ${ss.join(' ; ') || 'none'}`;
  }));
  const prompt = `You are an education taxonomy expert. Compare the PRIMARY concept with each CANDIDATE concept.
Definitions: equivalent=same learning objective; synonym=different words same meaning; related=connected but different objectives; parent_child=subtopic; keep_separate=different objectives.
Return ONLY a valid JSON array, no markdown. Each item: {"relatedId": number, "classification": string, "confidence": number (0-1), "evidence": string, "differences": string}.
Primary concept ${conceptId}: "${primary.nameEnglish}" | topic: ${primary.topic || 'n/a'} | subject: ${primary.subject || 'n/a'} | questions: ${primarySamples.join(' ; ') || 'none'}
Candidates:
${candidateLines.join('\\n')}`;

  const startedAt = Date.now();
  let parsed: any[] = [];
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_completion_tokens: 800 }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return res.status(502).json({ error: 'Groq request failed', detail: body.slice(0, 300) });
    }
    const data = await response.json() as any;
    const raw = data?.choices?.[0]?.message?.content || '';
    const match = raw.match(/\[[\s\S]*\]/);
    parsed = match ? JSON.parse(match[0]) : [];
  } catch (err: any) {
    return res.status(502).json({ error: 'Groq request failed', detail: String(err?.message || err).slice(0, 300) });
  }

  const store = loadSemanticStore();
  const now = new Date().toISOString();
  const suggestions = [];
  for (const item of parsed) {
    const relId = Number(item.relatedId);
    const related = siblings.find((s: any) => s.id === relId);
    if (!related) continue;
    const id = `sem_${conceptId}_${relId}_${Date.now()}`;
    const rec = {
      id,
      primaryConceptId: conceptId,
      relatedConceptId: relId,
      primaryName: primary.nameEnglish,
      relatedName: related.nameEnglish,
      classification: String(item.classification || 'keep_separate'),
      confidence: Number(item.confidence || 0),
      evidence: String(item.evidence || '').slice(0, 1000),
      differences: String(item.differences || '').slice(0, 1000),
      method: 'groq',
      status: 'pending',
      previousStatus: null,
      reviewerId: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    store.suggestions[id] = rec;
    suggestions.push(rec);
  }
  saveSemanticStore(store);
  return res.json({ primaryConceptId: conceptId, suggestions, durationMs: Date.now() - startedAt });
});

router.get('/taxonomy/discovery/suggestions', async (req: AuthRequest, res: Response) => {
  const store = loadSemanticStore();
  const list = Object.values(store.suggestions);
  const conceptId = req.query.conceptId ? Number(req.query.conceptId) : null;
  const status = req.query.status ? String(req.query.status) : null;
  let filtered = list;
  if (conceptId) filtered = filtered.filter((s: any) => s.primaryConceptId === conceptId || s.relatedConceptId === conceptId);
  if (status) filtered = filtered.filter((s: any) => s.status === status);
  filtered.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ total: filtered.length, items: filtered });
});

router.post('/taxonomy/discovery/suggestions/:id/decision', async (req: AuthRequest, res: Response) => {
  const store = loadSemanticStore();
  const id = req.params.id;
  const rec = store.suggestions[id];
  if (!rec) return res.status(404).json({ error: 'Suggestion not found' });
  const { action, notes } = req.body || {};
  const allowed = ['approve_equivalent', 'approve_alias', 'approve_related', 'keep_separate', 'reject', 'investigate'];
  if (!allowed.includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const statusMap: Record<string, string> = {
    approve_equivalent: 'approved_equivalent',
    approve_alias: 'approved_alias',
    approve_related: 'approved_related',
    keep_separate: 'kept_separate',
    reject: 'rejected',
    investigate: 'needs_investigation',
  };
  const now = new Date().toISOString();
  rec.previousStatus = rec.status;
  rec.status = statusMap[action];
  rec.reviewerId = req.user!.id;
  rec.notes = notes ? String(notes).slice(0, 2000) : null;
  rec.updatedAt = now;
  rec.history.push({ action, status: statusMap[action], reviewerId: req.user!.id, at: now, notes: rec.notes });
  store.suggestions[id] = rec;
  saveSemanticStore(store);
  return res.json({ ok: true, suggestion: rec });
});

// ── Automated Batch Discovery ────────────────────────────────────────────────
function tokenizeName(name: string): string[] {
  const stop = new Set(['the','of','and','in','to','a','an','for','with','on','at','by','is','are','or','as']);
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3 && !stop.has(t));
}

async function generateCandidatePairs(limit: number): Promise<{ id1: number; id2: number }[]> {
  const nodes = (await getTaxonomyNodes()).filter((n: any) => n.level === 'CONCEPT');
  const checkpoint = loadCheckpoint();
  const processed = new Set(checkpoint.processedPairIds);
  // inverted index
  const index = new Map<string, number[]>();
  for (const n of nodes) {
    for (const t of tokenizeName(n.nameEnglish)) {
      if (!index.has(t)) index.set(t, []);
      index.get(t)!.push(n.id);
    }
  }
  const seenPairs = new Set<string>();
  const pairs: { id1: number; id2: number }[] = [];
  const nameById = new Map(nodes.map((n: any) => [n.id, n.nameEnglish]));

  for (const n of nodes) {
    const candidateSet = new Set<number>();
    // same topic siblings
    for (const m of nodes) {
      if (m.id !== n.id && m.parentId === n.parentId) candidateSet.add(m.id);
    }
    // shared tokens
    for (const t of tokenizeName(n.nameEnglish)) {
      for (const id of index.get(t) || []) {
        if (id !== n.id) candidateSet.add(id);
      }
    }
    for (const cId of candidateSet) {
      const key = [n.id, cId].sort((a, b) => a - b).join('_');
      if (seenPairs.has(key) || processed.has(key)) continue;
      seenPairs.add(key);
      pairs.push({ id1: n.id, id2: cId });
      if (pairs.length >= limit) return pairs;
    }
  }
  return pairs;
}

router.get('/taxonomy/discovery/batch/status', async (_req: AuthRequest, res: Response) => {
  const cp = loadCheckpoint();
  const store = loadSemanticStore();
  const items = Object.values(store.suggestions) as any[];
  const autoAccepted = items.filter((s) => s.status === 'auto_accepted').length;
  const pending = items.filter((s) => s.status === 'pending').length;
  const rejected = items.filter((s) => s.status === 'rejected' || s.status === 'auto_rejected').length;
  return res.json({
    totalProcessedPairs: cp.totalProcessed,
    lastRunAt: cp.lastRunAt,
    storedSuggestions: items.length,
    autoAccepted,
    pending,
    rejected,
    groqRequests: cp.groqRequests,
    groqFailures: cp.groqFailures,
    estimatedTokens: cp.estimatedTokens,
    estimatedCostUsd: cp.estimatedCostUsd,
  });
});

router.post('/taxonomy/discovery/batch/run', async (req: AuthRequest, res: Response) => {
  const batchSize = Math.min(10, Math.max(1, Number(req.body?.batchSize || 5)));
  const candidateLimit = Math.min(50, Math.max(batchSize, Number(req.body?.candidateLimit || 20)));

  const pairs = await generateCandidatePairs(candidateLimit);
  if (pairs.length === 0) return res.json({ message: 'No new candidate pairs', processed: 0 });

  const nodes = await getTaxonomyNodes();
  const nodeById = new Map(nodes.map((n: any) => [n.id, n]));
  const store = loadSemanticStore();
  const checkpoint = loadCheckpoint();
  checkpoint.running = true;
  checkpoint.paused = false;
  saveCheckpoint(checkpoint);
  const apiKey = process.env.GROQ_API_KEY || process.env.AI_FALLBACK_API_KEY;
  if (!apiKey) { checkpoint.running = false; saveCheckpoint(checkpoint); return res.status(500).json({ error: 'Groq API key not configured' }); }

  let processed = 0;
  let failed = 0;
  const now = new Date().toISOString();

  // process in chunks of 5 per Groq call
  for (let i = 0; i < pairs.length && processed < batchSize; i += 5) {
    // pause check
    const cp = loadCheckpoint();
    if (cp.paused) { checkpoint.running = false; checkpoint.paused = true; saveCheckpoint(checkpoint); saveSemanticStore(store); return res.json({ message: 'Paused', processed, failed, candidatePairs: pairs.length, totalProcessed: checkpoint.totalProcessed }); }
    const chunk = pairs.slice(i, i + 5).slice(0, batchSize - processed);
    if (chunk.length === 0) break;

    async function samples(id: number) {
      const qs = await prisma.question.findMany({ where: { conceptId: id }, select: { text: true }, take: 2 });
      return qs.map((q: any) => String(q.text).slice(0, 100));
    }

    const lines = await Promise.all(chunk.map(async (p) => {
      const a = nodeById.get(p.id1);
      const b = nodeById.get(p.id2);
      const sa = await samples(p.id1);
      const sb = await samples(p.id2);
      return `Pair ${p.id1}|${p.id2}: A="${a?.nameEnglish}" (topic:${a?.topic}, subject:${a?.subject}) questions:${sa.join(';') || 'none'} || B="${b?.nameEnglish}" (topic:${b?.topic}, subject:${b?.subject}) questions:${sb.join(';') || 'none'}`;
    }));

    const prompt = `You are an education taxonomy expert. For each pair, classify the relationship between concept A and concept B.
Definitions:
- equivalent: same learning objective and same skill.
- synonym: different words, same meaning.
- related: connected but different learning objectives.
- parent_child: one is a subtopic of the other.
- keep_separate: different objectives; do not merge.
Return ONLY a valid JSON array, no markdown. Each item: {"pair":"id1|id2","classification":"equivalent|synonym|related|parent_child|keep_separate","confidence":number(0-1),"evidence":string,"differences":string,"contradictions":string}.
${lines.join('\\n')}`;

    let response: any = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_completion_tokens: 1000 }),
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) break;
        lastErr = new Error(`HTTP ${response.status}`);
      } catch (err: any) {
        lastErr = err;
        response = null;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
    try {
      if (!response || !response.ok) { failed += chunk.length; checkpoint.groqFailures++; continue; }
      checkpoint.groqRequests++;
      checkpoint.estimatedTokens += Math.ceil((prompt.length + 1000) / 4);
      checkpoint.estimatedCostUsd = checkpoint.estimatedTokens * 0.0000005;
      const data = await response.json() as any;
      const raw = data?.choices?.[0]?.message?.content || '';
      const match = raw.match(/\[[\s\S]*\]/);
      const parsed = match ? JSON.parse(match[0]) : [];

      for (const item of parsed) {
        const [id1s, id2s] = String(item.pair || '').split('|');
        const id1 = Number(id1s);
        const id2 = Number(id2s);
        if (!Number.isInteger(id1) || !Number.isInteger(id2)) continue;
        const a = nodeById.get(id1);
        const b = nodeById.get(id2);
        if (!a || !b) continue;
        const conf = Number(item.confidence || 0);
        const classification = String(item.classification || 'keep_separate');
        const nameSim = a.nameEnglish.toLowerCase() === b.nameEnglish.toLowerCase() ? 1 : 0;
        const evidenceText = String(item.evidence || '');
        const contradictionText = String(item.contradictions || '');
        const evidenceQuality = evidenceText.length >= 50 && !/none|n\/a/i.test(evidenceText) ? 1 : 0.5;
        const contradictionPenalty = contradictionText.trim() ? 1 : 0;
        // educational equivalence focused: no topic-similarity bonus
        const systemConf = Math.max(0, Math.min(1, (conf * 0.75) + (nameSim * 0.15) + (evidenceQuality * 0.10) - (contradictionPenalty * 0.20)));

        const confidenceComponents = {
          aiConfidence: conf,
          nameSimilarity: nameSim,
          evidenceQuality,
          contradictionPenalty,
        };

        // decision policy
        let decisionStatus = 'pending';
        if (systemConf >= 0.95 && ['equivalent', 'synonym', 'alternate name'].includes(classification.toLowerCase()) && !contradictionText.trim() && evidenceQuality >= 0.5) {
          decisionStatus = 'auto_accepted';
        } else if (systemConf >= 0.85) {
          decisionStatus = 'provisionally_accepted';
        } else if (systemConf < 0.65) {
          decisionStatus = 'auto_rejected';
        }

        const stableId = `batch_${[id1, id2].sort((x, y) => x - y).join('_')}`;
        // skip if already exists
        if (store.suggestions[stableId]) {
          processed++;
          continue;
        }

        const rec = {
          id: stableId,
          primaryConceptId: id1,
          relatedConceptId: id2,
          primaryName: a.nameEnglish,
          relatedName: b.nameEnglish,
          classification,
          confidence: conf,
          systemConfidence: systemConf,
          confidenceComponents,
          evidence: String(item.evidence || '').slice(0, 1000),
          differences: String(item.differences || '').slice(0, 1000),
          contradictions: String(item.contradictions || '').slice(0, 500),
          method: 'groq-batch',
          status: decisionStatus,
          previousStatus: null,
          reviewerId: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
          history: [{ action: 'auto', status: decisionStatus, reviewerId: 'system', at: now, notes: `systemConfidence=${systemConf.toFixed(3)}` }],
        };
        store.suggestions[stableId] = rec;
        processed++;
      }

      // mark pairs processed
      for (const p of chunk) {
        checkpoint.processedPairIds.push([p.id1, p.id2].sort((a, b) => a - b).join('_'));
      }
      checkpoint.totalProcessed = (checkpoint.totalProcessed || 0) + chunk.length;
      checkpoint.lastRunAt = new Date().toISOString();
      saveCheckpoint(checkpoint);
      saveSemanticStore(store);
    } catch (err: any) {
      failed += chunk.length;
      for (const p of chunk) checkpoint.failedPairIds.push([p.id1, p.id2].sort((a, b) => a - b).join('_'));
    }
  }

  checkpoint.running = false;
  saveCheckpoint(checkpoint);
  saveSemanticStore(store);
  return res.json({ processed, failed, candidatePairs: pairs.length, totalProcessed: checkpoint.totalProcessed });
});

// ── Batch controls ──────────────────────────────────────────────────────────
router.post('/taxonomy/discovery/batch/pause', async (_req: AuthRequest, res: Response) => {
  const cp = loadCheckpoint();
  cp.paused = true;
  saveCheckpoint(cp);
  return res.json({ ok: true, paused: true });
});

router.post('/taxonomy/discovery/batch/resume', async (_req: AuthRequest, res: Response) => {
  const cp = loadCheckpoint();
  cp.paused = false;
  cp.running = false;
  saveCheckpoint(cp);
  return res.json({ ok: true, paused: false });
});

router.post('/taxonomy/discovery/batch/retry-failed', async (_req: AuthRequest, res: Response) => {
  const cp = loadCheckpoint();
  // remove failed pairs from processed so they can be retried
  const failedSet = new Set(cp.failedPairIds);
  cp.processedPairIds = cp.processedPairIds.filter((id) => !failedSet.has(id));
  cp.failedPairIds = [];
  saveCheckpoint(cp);
  return res.json({ ok: true, retried: failedSet.size });
});

// ── Validation (labelled sample) ─────────────────────────────────────────────
router.post('/taxonomy/discovery/validate', async (req: AuthRequest, res: Response) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const samplePath = path.join(QBI_ROOT, 'backend', 'data', 'qbi_validation_sample.json');
  let sample: any[] = [];
  try { sample = JSON.parse(fs.readFileSync(samplePath, 'utf8')); } catch { return res.status(404).json({ error: 'Validation sample not found' }); }

  const nodes = await getTaxonomyNodes();
  const nodeById = new Map(nodes.map((n: any) => [n.id, n]));
  const apiKey = process.env.GROQ_API_KEY || process.env.AI_FALLBACK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Groq API key not configured' });

  const results: any[] = [];
  let correct = 0;
  for (const s of sample) {
    const a = nodeById.get(s.id1);
    const b = nodeById.get(s.id2);
    if (!a || !b) continue;
    const prompt = `Classify the relationship between two concepts. Return ONLY JSON: {"classification":"equivalent|synonym|related|parent_child|keep_separate","confidence":number}.
Concept A: ${a.nameEnglish} (topic: ${a.topic}, subject: ${a.subject})
Concept B: ${b.nameEnglish} (topic: ${b.topic}, subject: ${b.subject})`;
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_completion_tokens: 120 }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { results.push({ id1: s.id1, id2: s.id2, expected: s.expected, predicted: 'error', correct: false }); continue; }
      const data = await response.json() as any;
      const raw = data?.choices?.[0]?.message?.content || '';
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : {};
      const predicted = String(parsed.classification || 'unknown');
      const isCorrect = predicted === s.expected;
      if (isCorrect) correct++;
      results.push({ id1: s.id1, id2: s.id2, expected: s.expected, predicted, confidence: parsed.confidence, correct: isCorrect });
    } catch (err: any) {
      results.push({ id1: s.id1, id2: s.id2, expected: s.expected, predicted: 'error', correct: false, error: String(err?.message || err) });
    }
  }

  const accuracy = sample.length ? correct / sample.length : 0;
  // confusion matrix
  const classes = ['equivalent', 'synonym', 'related', 'parent_child', 'keep_separate'];
  const confusion: Record<string, Record<string, number>> = {};
  for (const c of classes) { confusion[c] = {}; for (const c2 of classes) confusion[c][c2] = 0; }
  for (const r of results) {
    if (confusion[r.expected] && confusion[r.expected][r.predicted] !== undefined) confusion[r.expected][r.predicted]++;
  }
  return res.json({ total: sample.length, correct, accuracy, confusion, results });
});

export default router;


