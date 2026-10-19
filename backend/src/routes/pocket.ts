import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma, Difficulty, ScratchTier } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeOptions } from '../lib/options';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const DEFAULT_BATCH = 8;
const MAX_BATCH = 20;
const DEFAULT_QUOTA = 70; // % of the batch that should be NONE/MENTAL before falling back
const POOL_SIZE = 600;

const PREFERRED = new Set<ScratchTier>([ScratchTier.NONE, ScratchTier.MENTAL]);

// Per-question tag wins over the chapter-level tier for exceptions.
function effectiveTier(tags: string[], chapterTier: ScratchTier): ScratchTier {
  if (tags.includes('scratch:none')) return ScratchTier.NONE;
  if (tags.includes('scratch:mental')) return ScratchTier.MENTAL;
  if (tags.includes('scratch:written')) return ScratchTier.WRITTEN;
  return chapterTier;
}

type PoolRow = {
  id: string;
  conceptId: number | null;
  chapterId: string;
  difficulty: Difficulty;
  scratchTier: ScratchTier;
  tags: string[];
  attempted: boolean;
};

// Chapter scope mirrors adaptive: learned chapters inside selected exams >
// learned only > selected exams only > whole bank (fresh account).
async function resolveScopeChapterIds(userId: string): Promise<string[] | null> {
  const [learnedChapters, selectedExamChapters] = await Promise.all([
    prisma.userChapter.findMany({ where: { userId, isLearned: true }, select: { chapterId: true } }),
    prisma.chapter.findMany({
      where: { subject: { exam: { userExams: { some: { userId } } } } },
      select: { id: true },
    }),
  ]);
  const learnedIds = learnedChapters.map((l) => l.chapterId);
  const selectedIds = selectedExamChapters.map((c) => c.id);
  if (learnedIds.length > 0 && selectedIds.length > 0) {
    const selectedSet = new Set(selectedIds);
    const intersect = learnedIds.filter((id) => selectedSet.has(id));
    return intersect.length > 0 ? intersect : selectedIds;
  }
  if (learnedIds.length > 0) return learnedIds;
  if (selectedIds.length > 0) return selectedIds;
  return null;
}

async function fetchPool(userId: string, scopeChapterIds: string[] | null, focusConceptId: number | null): Promise<PoolRow[]> {
  const attemptsPromise = prisma.questionAttempt.findMany({
    where: { userId },
    select: { questionId: true },
    distinct: ['questionId'],
  });
  const rows = (await prisma.$queryRaw`
    SELECT q.id, q."conceptId", q."chapterId", q.difficulty, c."scratchTier", q.tags
    FROM questions q
    JOIN chapters c ON c.id = q."chapterId"
    WHERE q."isActive" = true
    ${focusConceptId !== null ? Prisma.sql`AND q."conceptId" = ${focusConceptId}` : Prisma.empty}
    ${scopeChapterIds ? Prisma.sql`AND q."chapterId" IN (${Prisma.join(scopeChapterIds)})` : Prisma.empty}
    LIMIT ${POOL_SIZE}
  `) as { id: string; conceptId: number | null; chapterId: string; difficulty: Difficulty; scratchTier: ScratchTier; tags: string[] }[];

  const attempted = new Set((await attemptsPromise).map((a) => a.questionId));
  return rows.map((r) => ({ ...r, attempted: attempted.has(r.id) }));
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Deal a batch: fill `preferredTarget` with NONE/MENTAL first, then top up from
// WRITTEN, then widen with whatever is left so the batch is never short.
type Dealt = PoolRow & { tier: ScratchTier };

function deal(pool: PoolRow[], batchSize: number, quota: number): { picked: Dealt[]; preferred: number; fallback: number } {
  const enriched: Dealt[] = pool.map((r) => ({ ...r, tier: effectiveTier(r.tags, r.scratchTier) }));
  const untried = shuffle(enriched.filter((r) => !r.attempted));
  const retried = shuffle(enriched.filter((r) => r.attempted));

  const preferredTarget = Math.max(1, Math.round((batchSize * quota) / 100));
  const preferred = untried.filter((r) => PREFERRED.has(r.tier));
  const rest = untried.filter((r) => !PREFERRED.has(r.tier));

  const picked: Dealt[] = [];
  const take = (src: Dealt[], n: number) => {
    for (const r of src) {
      if (picked.length >= batchSize || n <= 0) break;
      if (picked.some((p) => p.id === r.id)) continue;
      picked.push(r);
      n--;
    }
  };

  take(preferred, Math.min(preferredTarget, batchSize));
  take(rest, batchSize - picked.length);
  if (picked.length < batchSize) take(retried, batchSize - picked.length);

  const preferredCount = picked.filter((r) => PREFERRED.has(r.tier)).length;
  return { picked, preferred: preferredCount, fallback: picked.length - preferredCount };
}

// Deal a fresh pocket batch. The whole batch is written up front so it can be
// played offline; answers land on PocketItem keyed by clientId.
router.post('/start', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const batchSize = Math.min(MAX_BATCH, Math.max(1, Number(req.body?.batchSize) || DEFAULT_BATCH));
  const quota = Math.min(100, Math.max(0, Number(req.body?.quota) || DEFAULT_QUOTA));
  const focusConceptId = typeof req.body?.conceptId === 'number' ? req.body.conceptId : null;

  const scopeChapterIds = await resolveScopeChapterIds(userId);
  let source = await fetchPool(userId, scopeChapterIds, focusConceptId);
  if (source.length === 0) source = await fetchPool(userId, null, focusConceptId);

  const { picked, preferred, fallback } = deal(source, batchSize, quota);
  if (picked.length === 0) {
    return res.status(404).json({ message: 'No questions available for a pocket session right now.' });
  }

  const session = await prisma.pocketSession.create({
    data: {
      userId,
      batchSize: picked.length,
      quota,
      focusConceptId,
      totalQ: 0,
      correctQ: 0,
    },
  });

  await prisma.pocketItem.createMany({
    data: picked.map((q, i) => ({
      sessionId: session.id,
      questionId: q.id,
      order: i + 1,
      clientId: randomUUID(), // echoed back by the client when it answers, so retries are idempotent
    })),
  });

  const items = await prisma.pocketItem.findMany({
    where: { sessionId: session.id },
    orderBy: { order: 'asc' },
    include: { question: { include: { chapter: { include: { subject: true } }, concept: true } } },
  });

  // correctOption ships with the batch so the client can grade while offline.
  return res.json({
    session,
    tiers: { preferred, fallback },
    items: items.map((it) => {
      const { correctOption, ...safe } = it.question;
      return {
        id: it.id,
        order: it.order,
        clientId: it.clientId,
        question: {
          id: safe.id,
          text: safe.text,
          options: normalizeOptions(safe.options),
          correctOption,
          explanation: safe.explanation,
          difficulty: safe.difficulty,
          tags: safe.tags,
          chapter: { name: safe.chapter.name, subject: safe.chapter.subject.name },
          concept: safe.concept ? { id: safe.concept.id, level: safe.concept.level, nameEnglish: safe.concept.nameEnglish } : null,
        },
      };
    }),
  });
});

// ---------- answers ----------

async function ownedSession(userId: string, sessionId: string) {
  return prisma.pocketSession.findFirst({ where: { id: sessionId, userId } });
}

// Grade one answer. Idempotent on clientId: a replay (offline queue flushed
// twice, flaky network) never double-counts the attempt or the concept stat.
async function recordAnswer(
  userId: string,
  sessionId: string,
  input: { clientId: string; questionId?: string; selectedOption: number; timeTaken?: number }
) {
  if (!Number.isInteger(input.selectedOption)) {
    return { status: 400 as const, body: { message: 'selectedOption must be an integer.' } };
  }

  const item = await prisma.pocketItem.findUnique({
    where: { clientId: input.clientId },
    include: { question: { select: { id: true, correctOption: true, conceptId: true, chapterId: true } } },
  });
  if (!item || item.sessionId !== sessionId) {
    return { status: 404 as const, body: { message: 'Unknown answer clientId for this session.' } };
  }
  if (input.questionId && input.questionId !== item.questionId) {
    return { status: 409 as const, body: { message: 'clientId does not match questionId.' } };
  }

  const isCorrect = input.selectedOption === item.question.correctOption;
  const timeTaken = Math.max(0, Number(input.timeTaken) || 0);
  const answeredAt = new Date();

  const stored = await prisma.$transaction(async (tx) => {
    // Atomic claim: only the first writer for this clientId applies the effects.
    const claim = await tx.pocketItem.updateMany({
      where: { id: item.id, answeredAt: null },
      data: { selectedOption: input.selectedOption, isCorrect, timeTaken, answeredAt },
    });
    if (claim.count === 0) return null; // already recorded

    const upsertStat = item.question.conceptId !== null
      ? tx.$executeRaw`
          INSERT INTO user_concept_stats (id, "userId", "conceptId", total, correct, "updatedAt")
          VALUES (gen_random_uuid()::text, ${userId}, ${item.question.conceptId}, 1, ${isCorrect ? 1 : 0}, now())
          ON CONFLICT ("userId", "conceptId") WHERE "conceptId" IS NOT NULL
          DO UPDATE SET total = user_concept_stats.total + 1,
                        correct = user_concept_stats.correct + ${isCorrect ? 1 : 0},
                        "updatedAt" = now()`
      : tx.$executeRaw`
          INSERT INTO user_concept_stats (id, "userId", "chapterId", total, correct, "updatedAt")
          VALUES (gen_random_uuid()::text, ${userId}, ${item.question.chapterId}, 1, ${isCorrect ? 1 : 0}, now())
          ON CONFLICT ("userId", "chapterId") WHERE "chapterId" IS NOT NULL
          DO UPDATE SET total = user_concept_stats.total + 1,
                        correct = user_concept_stats.correct + ${isCorrect ? 1 : 0},
                        "updatedAt" = now()`;

    await Promise.all([
      upsertStat,
      tx.questionAttempt.create({
        data: {
          userId,
          questionId: item.questionId,
          selectedOption: input.selectedOption,
          isCorrect,
          timeTaken,
          sessionId: null, // FK points at AdaptiveSession; pocket sessions score on PocketSession
        },
      }),
      tx.pocketSession.update({
        where: { id: sessionId },
        data: { totalQ: { increment: 1 }, correctQ: isCorrect ? { increment: 1 } : undefined },
      }),
    ]);

    return { selectedOption: input.selectedOption, isCorrect, timeTaken };
  });

  const full = await prisma.question.findUnique({
    where: { id: item.questionId },
    select: { correctOption: true, explanation: true },
  });

  if (stored === null) {
    // Replay of an answer already applied — return the recorded outcome.
    return {
      status: 200 as const,
      body: { duplicate: true, isCorrect: item.isCorrect, correctOption: full!.correctOption, explanation: full!.explanation },
    };
  }

  prisma.userActivity.create({
    data: {
      userId,
      type: 'QUESTION_ANSWERED',
      metadata: { pocketSessionId: sessionId, questionId: item.questionId, isCorrect, selectedOption: input.selectedOption, timeTaken },
    },
  }).catch(() => {});

  return {
    status: 200 as const,
    body: { duplicate: false, isCorrect, correctOption: full!.correctOption, explanation: full!.explanation },
  };
}

// Single answer — used for instant feedback while online.
router.post('/session/:sessionId/answer', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;
  if (!(await ownedSession(userId, sessionId))) return res.status(404).json({ message: 'Session not found' });

  const { clientId, questionId, selectedOption, timeTaken } = req.body || {};
  if (typeof clientId !== 'string') return res.status(400).json({ message: 'clientId is required' });

  const { status, body } = await recordAnswer(userId, sessionId, { clientId, questionId, selectedOption, timeTaken });
  return res.status(status).json(body);
});

// Offline flush — an array of answers replayed on reconnect. Each entry is
// idempotent on its own clientId, so replaying the whole queue is safe.
router.post('/session/:sessionId/sync', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;
  if (!(await ownedSession(userId, sessionId))) return res.status(404).json({ message: 'Session not found' });

  const raw = req.body?.answers;
  if (!Array.isArray(raw)) return res.status(400).json({ message: 'answers must be an array' });

  const applied: unknown[] = [];
  const duplicates: { clientId: string; isCorrect: boolean | null }[] = [];
  const rejected: { clientId: unknown; message: string }[] = [];
  for (const entry of raw) {
    if (typeof entry?.clientId !== 'string') {
      rejected.push({ clientId: entry?.clientId, message: 'clientId is required' });
      continue;
    }
    const { status, body } = await recordAnswer(userId, sessionId, entry);
    if (status !== 200) {
      rejected.push({ clientId: entry.clientId, message: (body as { message: string }).message });
    } else if ((body as { duplicate?: boolean }).duplicate) {
      duplicates.push({ clientId: entry.clientId, isCorrect: (body as { isCorrect: boolean | null }).isCorrect });
    } else {
      applied.push(body);
    }
  }

  const session = await prisma.pocketSession.findUnique({ where: { id: sessionId } });
  return res.json({
    applied: applied.length,
    duplicates: duplicates.length,
    rejected,
    totalQ: session?.totalQ ?? 0,
    correctQ: session?.correctQ ?? 0,
  });
});

// Resume a session's batch (also serves as the "what's left to answer" view).
router.get('/session/:sessionId', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const session = await ownedSession(userId, req.params.sessionId);
  if (!session) return res.status(404).json({ message: 'Session not found' });

  const items = await prisma.pocketItem.findMany({
    where: { sessionId: session.id },
    orderBy: { order: 'asc' },
    include: { question: { include: { chapter: { include: { subject: true } } } } },
  });

  return res.json({
    session,
    items: items.map((it) => {
      const { correctOption, ...safe } = it.question;
      return {
        id: it.id,
        order: it.order,
        clientId: it.clientId,
        answeredAt: it.answeredAt,
        selectedOption: it.selectedOption,
        isCorrect: it.isCorrect,
        question: {
          id: safe.id,
          text: safe.text,
          options: normalizeOptions(safe.options),
          correctOption,
          explanation: safe.explanation,
          difficulty: safe.difficulty,
          tags: safe.tags,
          chapter: { name: safe.chapter.name, subject: safe.chapter.subject.name },
        },
      };
    }),
  });
});

// End a session and return its score.
router.post('/session/:sessionId/end', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;
  const session = await ownedSession(userId, sessionId);
  if (!session) return res.status(404).json({ message: 'Session not found' });

  const updated = await prisma.pocketSession.update({
    where: { id: sessionId },
    data: { endedAt: session.endedAt ?? new Date() },
  });

  const unanswered = await prisma.pocketItem.count({ where: { sessionId, answeredAt: null } });
  return res.json({ ...updated, unanswered, score: updated.totalQ ? updated.correctQ / updated.totalQ : 0 });
});

export default router;
