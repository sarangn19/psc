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

  // Single raw SQL query: fetches session + seen items + learned chapters + attempt stats
  // in ONE round-trip instead of 4 sequential Prisma queries
  const rows: any[] = await prisma.$queryRaw`
    SELECT
      s.id AS "sessionId", s."focusConceptId", s."userId",
      (SELECT json_agg(json_build_object('questionId', ai."questionId", 'text', q.text))
        FROM adaptive_items ai JOIN questions q ON q.id = ai."questionId"
        WHERE ai."sessionId" = ${sessionId}) AS "seenItems",
      (SELECT json_agg(uc."chapterId")
        FROM user_chapters uc WHERE uc."userId" = ${userId} AND uc."isLearned" = true) AS "learnedChapters",
      (SELECT json_agg(json_build_object('questionId', qa."questionId", 'isCorrect', qa."isCorrect", 'conceptId', qq."conceptId", 'chapterId', qq."chapterId"))
        FROM question_attempts qa JOIN questions qq ON qq.id = qa."questionId"
        WHERE qa."userId" = ${userId}) AS "allAttempts"
    FROM adaptive_sessions s WHERE s.id = ${sessionId} AND s."userId" = ${userId}
  `;
  if (!rows.length) return res.status(404).json({ message: 'Session not found' });
  const row = rows[0];

  const seenIds = new Set<string>((row.seenItems || []).map((i: any) => i.questionId));
  const seenTexts = new Set<string>((row.seenItems || []).map((i: any) => i.text));

  let chapterIds: string[] = (row.learnedChapters || []) as string[];
  if (chapterIds.length === 0) {
    const caChapter = await prisma.chapter.findFirst({ where: { name: 'Monthly Current Affairs' } });
    if (caChapter) chapterIds = [caChapter.id];
  }

  // Fetch candidates (1 query)
  const isFocused = row.focusConceptId !== null && row.focusConceptId !== undefined;
  const [rawCandidates, rawAdjacent] = await Promise.all([
    isFocused
      ? fetchCandidates({ conceptId: row.focusConceptId, isActive: true, id: { notIn: [...seenIds] } })
      : fetchCandidates({ chapterId: { in: chapterIds }, isActive: true, id: { notIn: [...seenIds] } }),
    isFocused ? findAdjacentQuestions([row.focusConceptId], seenIds) : Promise.resolve([]),
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

  // Build stats from attempt data (already fetched in the raw SQL above)
  const allAttempts = row.allAttempts || [];
  const stats = new Map<string, { total: number; correct: number }>();
  for (const a of allAttempts) {
    const key = a.conceptId !== null ? `concept:${a.conceptId}` : `chapter:${a.chapterId}`;
    const s = stats.get(key) || { total: 0, correct: 0 };
    s.total++;
    if (a.isCorrect) s.correct++;
    stats.set(key, s);
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
  seenIds: Set<string>
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

  // Track this question in session (use seenItems count from raw SQL)
  const order = (row.seenItems || []).length + 1;
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

  const attempt = await prisma.questionAttempt.create({
    data: { userId, questionId, selectedOption, isCorrect, timeTaken: timeTaken || 0, sessionId },
  });

  const session = await prisma.adaptiveSession.findUnique({ where: { id: sessionId } });
  if (session) {
    await prisma.adaptiveSession.update({
      where: { id: sessionId },
      data: {
        totalQ: session.totalQ + 1,
        correctQ: session.correctQ + (isCorrect ? 1 : 0),
        score: ((session.correctQ + (isCorrect ? 1 : 0)) / (session.totalQ + 1)) * 100,
      },
    });
  }

  await prisma.userActivity.create({
    data: {
      userId,
      type: 'QUESTION_ANSWERED',
      metadata: { questionId, isCorrect, selectedOption, timeTaken },
    },
  });

  return res.json({
    isCorrect,
    correctOption: question.correctOption,
    explanation: question.explanation,
    attempt,
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

  // All user attempts (fast with @@index([userId]))
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    select: { questionId: true, isCorrect: true },
  });
  if (attempts.length === 0) return res.json([]);

  const attemptedIds = [...new Set(attempts.map((a) => a.questionId))];
  const mapped = await prisma.question.findMany({
    where: { id: { in: attemptedIds }, conceptId: { not: null } },
    select: { id: true, conceptId: true },
  });
  if (mapped.length === 0) return res.json([]);

  const qConcept = new Map(mapped.map((q) => [q.id, q.conceptId as number]));
  const stats = new Map<number, { total: number; correct: number }>();
  for (const a of attempts) {
    const cid = qConcept.get(a.questionId);
    if (cid === undefined) continue;
    const s = stats.get(cid) || { total: 0, correct: 0 };
    s.total++;
    if (a.isCorrect) s.correct++;
    stats.set(cid, s);
  }

  const conceptIds = [...stats.keys()];
  const nodes = await prisma.taxonomyNode.findMany({ where: { id: { in: conceptIds } } });
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Resolve all paths from in-memory cache (no DB queries)
  const pathMap = await getCachedNodePaths(conceptIds);

  const questionCounts = await prisma.question.groupBy({
    by: ['conceptId'],
    where: { conceptId: { in: conceptIds }, isActive: true },
    _count: { _all: true },
  });
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
