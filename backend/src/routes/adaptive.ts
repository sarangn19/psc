import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { normalizeOptions } from '../lib/options';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Difficulty, NodeLevel, Prisma } from '@prisma/client';
import { getCachedNodePath, getCachedNodePaths, warmTaxonomyCache } from '../lib/taxonomyCache';

const router = Router();

const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  [Difficulty.EASY]: 0,
  [Difficulty.MEDIUM]: 1,
  [Difficulty.HARD]: 2,
};

const RICH_QUESTION_SELECT: Prisma.QuestionInclude = {
  chapter: { include: { subject: true } },
  concept: true,
};

type RichQuestion = Prisma.QuestionGetPayload<{ include: typeof RICH_QUESTION_SELECT }>;

// Subjects that require math / pen-and-paper — hidden in travel-friendly mode
const PEN_PAPER_SUBJECTS = [
  'Mathematics', 'Algebra', 'Calculus', 'Coordinate Geometry', 'Numerical Methods',
  'Quantitative Aptitude', 'Statistics', 'Statistics & Probability', 'Logic',
  'Reasoning', 'Reasoning Ability',
  'Mechanics', 'Thermodynamics', 'Fluid Mechanics', 'Circuit Theory',
  'Control Systems', 'Electrical Machines', 'Power Electronics', 'Power Systems',
  'Structural Engineering', 'Geotechnical Engineering', 'Transportation Engineering',
  'Surveying', 'Water Resources', 'Industrial Engineering', 'Manufacturing',
  'Physical Chemistry', 'Analytical Chemistry',
  'Accountancy', 'Financial Management', 'Public Finance',
];

async function fetchCandidates(where: Prisma.QuestionWhereInput): Promise<RichQuestion[]> {
  return prisma.question.findMany({ where, include: RICH_QUESTION_SELECT });
}

// Mastery thresholds
const MASTERY_ACCURACY = 0.8;
const MIN_ATTEMPTS_FOR_MASTERY = 5;
const MIN_ATTEMPTS_FOR_ZONE = 5;
const SIBLING_QUERY_LIMIT = 30;

function zoneFor(accuracy: number, total: number): string {
  if (total < MIN_ATTEMPTS_FOR_ZONE) return 'UNTESTED';
  if (accuracy >= 0.7) return 'STRONG';
  if (accuracy >= 0.4) return 'MEDIUM';
  return 'WEAK';
}

interface ConceptInfo {
  id: number | null;
  name: string;
  level: NodeLevel | 'CHAPTER';
  path: { level: string; name: string }[];
  total: number;
  correct: number;
  accuracy: number;
  mastery: boolean;
  zone: string;
}

// Resolve ancestor path — uses in-memory cache (no DB queries)
async function getNodePath(conceptId: number): Promise<{ level: string; name: string }[]> {
  return getCachedNodePath(conceptId);
}

async function buildConceptInfo(
  conceptId: number | null,
  statsKey: string,
  chapterName: string,
  stats: Map<string, { total: number; correct: number }>
): Promise<ConceptInfo> {
  if (conceptId === null) {
    const s = stats.get(statsKey) || { total: 0, correct: 0 };
    const accuracy = s.total > 0 ? s.correct / s.total : 0;
    return {
      id: null,
      name: chapterName,
      level: 'CHAPTER',
      path: [{ level: 'CHAPTER', name: chapterName }],
      total: s.total,
      correct: s.correct,
      accuracy: Math.round(accuracy * 100),
      mastery: s.total >= MIN_ATTEMPTS_FOR_MASTERY && accuracy >= MASTERY_ACCURACY,
      zone: zoneFor(accuracy, s.total),
    };
  }

  const path = await getNodePath(conceptId);
  const s = stats.get(statsKey) || { total: 0, correct: 0 };
  const accuracy = s.total > 0 ? s.correct / s.total : 0;

  return {
    id: conceptId,
    name: path.length ? path[path.length - 1].name : `Concept ${conceptId}`,
    level: (path.length ? path[path.length - 1].level : 'CONCEPT') as NodeLevel,
    path,
    total: s.total,
    correct: s.correct,
    accuracy: Math.round(accuracy * 100),
    mastery: s.total >= MIN_ATTEMPTS_FOR_MASTERY && accuracy >= MASTERY_ACCURACY,
    zone: zoneFor(accuracy, s.total),
  };
}

// Start adaptive session (optionally focused on a single concept)
router.post('/session/start', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const focusConceptId = typeof req.body?.conceptId === 'number' ? req.body.conceptId : null;

  const session = await prisma.adaptiveSession.create({
    data: { userId, focusConceptId },
  });

  await prisma.userActivity.create({
    data: {
      userId,
      type: 'ADAPTIVE_SESSION_STARTED',
      metadata: { sessionId: session.id, focusConceptId },
    },
  });

  return res.json(session);
});

// Get next question for adaptive session
router.get('/session/:sessionId/next', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  // Phase 1: all independent reads in parallel
  const [session, seenItems, learnedChapters, conceptStats, user] = await Promise.all([
    prisma.adaptiveSession.findUnique({ where: { id: sessionId } }),
    prisma.adaptiveItem.findMany({
      where: { sessionId },
      select: { questionId: true, question: { select: { text: true } } },
    }),
    prisma.userChapter.findMany({ where: { userId, isLearned: true }, select: { chapterId: true } }),
    prisma.userConceptStat.findMany({
      where: { userId },
      select: { conceptId: true, chapterId: true, total: true, correct: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { travelMode: true } }),
  ]);

  if (!session || session.userId !== userId) return res.status(404).json({ message: 'Session not found' });

  const seenIds = new Set(seenItems.map((si) => si.questionId));
  const seenTexts = new Set(seenItems.map((si) => si.question.text));

  let chapterIds = learnedChapters.map((lc) => lc.chapterId);
  if (chapterIds.length === 0) {
    const caChapter = await prisma.chapter.findFirst({ where: { name: 'Monthly Current Affairs' } });
    if (caChapter) chapterIds = [caChapter.id];
  }

  // Phase 2: fetch candidates
  const isFocused = session.focusConceptId !== null && session.focusConceptId !== undefined;
  const penPaperFilter: Prisma.QuestionWhereInput = user?.travelMode
    ? { chapter: { subject: { name: { notIn: PEN_PAPER_SUBJECTS } } } }
    : {};
  const [rawCandidates, rawAdjacent] = await Promise.all([
    isFocused
      ? fetchCandidates({ conceptId: session.focusConceptId, isActive: true, id: { notIn: [...seenIds] }, ...penPaperFilter })
      : fetchCandidates({ chapterId: { in: chapterIds }, isActive: true, id: { notIn: [...seenIds] }, ...penPaperFilter }),
    isFocused ? findAdjacentQuestions([session.focusConceptId!], seenIds, penPaperFilter) : Promise.resolve([]),
  ]);

  let candidates: RichQuestion[];
  let doneMessage = 'All questions in learned chapters completed!';

  if (isFocused) {
    candidates = rawCandidates.filter((q) => !seenTexts.has(q.text));
    if (candidates.length === 0) {
      candidates = rawAdjacent.filter((q) => !seenTexts.has(q.text));
    }
    doneMessage = 'Focused practice complete! You have covered this concept and its related topics.';
  } else {
    candidates = rawCandidates.filter((q) => !seenTexts.has(q.text));
  }

  if (candidates.length === 0) {
    return res.json({ done: true, message: doneMessage });
  }

  // Build stats map directly from pre-aggregated UserConceptStat — O(n) over
  // a small result set, accurate for all-time history, no scan of raw attempts.
  const stats = new Map<string, { total: number; correct: number }>();
  for (const s of conceptStats) {
    const key = s.conceptId !== null ? `concept:${s.conceptId}` : `chapter:${s.chapterId}`;
    stats.set(key, { total: s.total, correct: s.correct });
  }

  interface RankedGroup {
  key: string;
  questions: RichQuestion[];
  accuracy: number;
  total: number;
  mastery: boolean;
  sortKey: number;
}

// Group candidates by concept (or chapter), sort groups so unmastered/weakest
// concepts come first, and ramp EASY -> HARD within each group.
function rankGroups(
  questionsList: RichQuestion[],
  stats: Map<string, { total: number; correct: number }>
): RankedGroup[] {
  const groups = new Map<string, RichQuestion[]>();
  for (const c of questionsList) {
    const key = c.conceptId !== null ? `concept:${c.conceptId}` : `chapter:${c.chapterId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  return [...groups.entries()].map(([key, questions]) => {
    const s = stats.get(key) || { total: 0, correct: 0 };
    const accuracy = s.total > 0 ? s.correct / s.total : 0;
    questions.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
    return {
      key,
      questions,
      accuracy,
      total: s.total,
      mastery: s.total >= MIN_ATTEMPTS_FOR_MASTERY && accuracy >= MASTERY_ACCURACY,
      sortKey: questions[0].conceptId !== null ? questions[0].conceptId : Infinity,
    };
  }).sort((a, b) => {
    if (a.mastery !== b.mastery) return Number(a.mastery) - Number(b.mastery);
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    if (a.total !== b.total) return a.total - b.total;
    return a.sortKey - b.sortKey;
  });
}

// Pull questions from adjacent (sibling) concepts sharing a topic with a
// mastered concept, so the user advances along the taxonomy graph.
async function findAdjacentQuestions(
  masteredConceptIds: number[],
  seenIds: Set<string>,
  penPaperFilter: Prisma.QuestionWhereInput = {}
): Promise<RichQuestion[]> {
  if (masteredConceptIds.length === 0) return [];

  const nodes = await prisma.taxonomyNode.findMany({
    where: { id: { in: masteredConceptIds } },
    select: { parentId: true },
  });
  const topicIds = [...new Set(nodes.map((n) => n.parentId).filter((id): id is number => id !== null))];
  if (topicIds.length === 0) return [];

  const siblings = await prisma.taxonomyNode.findMany({
    where: { parentId: { in: topicIds }, id: { notIn: masteredConceptIds } },
    select: { id: true },
    take: SIBLING_QUERY_LIMIT,
  });
  if (siblings.length === 0) return [];

  return fetchCandidates({
    conceptId: { in: siblings.map((s) => s.id) },
    isActive: true,
    id: { notIn: [...seenIds] },
    ...penPaperFilter,
  });
}

// Order concepts weakest-first; advance through the taxonomy as mastery grows.
const ranked = rankGroups(candidates, stats);
let chosen: RichQuestion | null = null;
if (ranked.length) chosen = ranked[0].questions[0];

// Every concept in the learned pool is mastered -> advance to adjacent,
// unmastered concepts from the same topic.
if (ranked.length > 0 && ranked.every((g) => g.mastery)) {
  const masteredConceptIds = [
    ...new Set(
      ranked.flatMap((g) => g.questions).map((q) => q.conceptId).filter((id): id is number => id !== null)
    ),
  ];
  const adjacent = await findAdjacentQuestions(masteredConceptIds, seenIds);
  if (adjacent.length > 0) {
    const adjacentRanked = rankGroups(adjacent, stats);
    if (adjacentRanked.length) chosen = adjacentRanked[0].questions[0];
  }
}

if (!chosen) {
  return res.json({ done: true, message: 'All questions in learned chapters completed!' });
}

  // Track this question in session
  const order = seenItems.length + 1;
  await prisma.adaptiveItem.create({
    data: { sessionId, questionId: chosen.id, order },
  });

  const statsKey = chosen.conceptId !== null ? `concept:${chosen.conceptId}` : `chapter:${chosen.chapterId}`;
  const concept = await buildConceptInfo(chosen.conceptId, statsKey, chosen.chapter.name, stats);

  const { correctOption, ...safeQuestion } = chosen;
  const safe = {
    id: safeQuestion.id,
    text: safeQuestion.text,
    options: normalizeOptions(safeQuestion.options),
    difficulty: safeQuestion.difficulty,
    tags: safeQuestion.tags,
    chapter: safeQuestion.chapter,
    concept: safeQuestion.concept
      ? { id: safeQuestion.concept.id, level: safeQuestion.concept.level, nameEnglish: safeQuestion.concept.nameEnglish }
      : null,
  };

  return res.json({
    question: safe,
    concept,
    questionNumber: order,
  });
});

// Submit answer
router.post('/session/:sessionId/answer', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;
  const { questionId, selectedOption, timeTaken } = req.body;

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) return res.status(404).json({ message: 'Question not found' });

  const isCorrect = selectedOption === question.correctOption;

  // Upsert aggregated stat using raw SQL (handles partial unique indexes on nullable columns)
  const upsertStat = question.conceptId !== null
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
                      "updatedAt" = now()`;

  // Parallel writes: attempt + session update + stat upsert
  await Promise.all([
    prisma.questionAttempt.create({
      data: { userId, questionId, selectedOption, isCorrect, timeTaken: timeTaken || 0, sessionId },
    }),
    prisma.adaptiveSession.update({
      where: { id: sessionId },
      data: {
        totalQ: { increment: 1 },
        correctQ: isCorrect ? { increment: 1 } : undefined,
      },
    }),
    upsertStat,
  ]);

  // Fire-and-forget: log activity (don't block the response)
  prisma.userActivity.create({
    data: {
      userId,
      type: 'QUESTION_ANSWERED',
      metadata: { questionId, isCorrect, selectedOption, timeTaken },
    },
  }).catch(() => {});

  return res.json({
    isCorrect,
    correctOption: question.correctOption,
    explanation: question.explanation,
  });
});

// End session
router.post('/session/:sessionId/end', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  const session = await prisma.adaptiveSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
  });

  await prisma.userActivity.create({
    data: { userId, type: 'ADAPTIVE_SESSION_ENDED', metadata: { sessionId, score: session.score } },
  });

  return res.json(session);
});

// Get session history (previous questions)
router.get('/session/:sessionId/history', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  const items = await prisma.adaptiveItem.findMany({
    where: { sessionId },
    orderBy: { order: 'asc' },
    include: {
      question: {
        include: {
          chapter: { include: { subject: true } },
          concept: true,
        },
      },
    },
  });

  const attempts = await prisma.questionAttempt.findMany({
    where: { userId, sessionId },
  });

  const attemptMap = new Map(attempts.map((a) => [a.questionId, a]));

  const history = items.map((item) => ({
    ...item.question,
    options: normalizeOptions(item.question.options),
    attempt: attemptMap.get(item.questionId) || null,
    order: item.order,
  }));

  return res.json(history);
});

// Get all sessions for user
router.get('/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  const sessions = await prisma.adaptiveSession.findMany({
    where: { userId: req.user!.id },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  return res.json(sessions);
});

const TAXONOMY_APP_URL = process.env.TAXONOMY_APP_URL || 'http://localhost:3000';

interface WeakConcept {
  conceptId: number;
  name: string;
  level: NodeLevel;
  slug: string;
  description: string | null;
  path: { level: string; name: string }[];
  notesUrl: string;
  total: number;
  correct: number;
  accuracy: number;
  zone: string;
  mastery: boolean;
  questionCount: number;
}

// User's weakest concepts (worst accuracy first) for the Learning tab
router.get('/weak-concepts', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Read from pre-aggregated stats — fast, accurate, no attempt scan
  const conceptStats = await prisma.userConceptStat.findMany({
    where: { userId, conceptId: { not: null } },
    select: { conceptId: true, total: true, correct: true },
  });
  if (conceptStats.length === 0) return res.json([]);

  const stats = new Map<number, { total: number; correct: number }>(
    conceptStats.map((s) => [s.conceptId!, { total: s.total, correct: s.correct }])
  );

  const conceptIds = [...stats.keys()];
  const [nodes, questionCounts, pathMap] = await Promise.all([
    prisma.taxonomyNode.findMany({ where: { id: { in: conceptIds } } }),
    prisma.question.groupBy({
      by: ['conceptId'],
      where: { conceptId: { in: conceptIds }, isActive: true },
      _count: { _all: true },
    }),
    getCachedNodePaths(conceptIds),
  ]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const countMap = new Map(questionCounts.map((c) => [c.conceptId, c._count._all]));

  const items = [...stats.entries()].map(([conceptId, s]) => {
    const node = nodeMap.get(conceptId);
    if (!node) return null;
    const accuracy = s.correct / s.total;
    return {
      conceptId,
      name: node.nameEnglish,
      level: node.level,
      slug: node.slug,
      description: node.description,
      path: pathMap.get(conceptId) || [],
      notesUrl: `${TAXONOMY_APP_URL}/node/${node.slug}`,
      total: s.total,
      correct: s.correct,
      accuracy: Math.round(accuracy * 100),
      zone: zoneFor(accuracy, s.total),
      mastery: s.total >= MIN_ATTEMPTS_FOR_MASTERY && accuracy >= MASTERY_ACCURACY,
      questionCount: countMap.get(conceptId) || 0,
    };
  });

  const cleaned = items.filter((i): i is WeakConcept => i !== null);
  cleaned.sort((a, b) => a.accuracy - b.accuracy || a.total - b.total);
  return res.json(cleaned.slice(0, 20));
});

export default router;
