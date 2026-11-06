import { Prisma, PrismaClient } from '@prisma/client';
import { scheduleRevision } from './revisionScheduler';

export interface AnswerSubmissionInput {
  userId: string;
  sessionId: string;
  questionId: string;
  selectedOption: number;
  timeTaken: number;
  submissionKey: string;
  isCorrect: boolean;
  conceptId: number | null;
  chapterId: string | null;
  masteryBefore: number | null;
  previousMastery: number | null;
  attemptCountBefore: number;
  repeatedMistakes: number;
  existingIntervalDays: number | null;
  consecutiveSuccesses: number;
}

export interface AnswerSubmissionResult {
  attemptId: string;
  isCorrect: boolean;
  selectedOption: number;
  duplicate: boolean;
  submissionKey: string;
}

export async function submitAnswerAtomically(
  prisma: PrismaClient,
  input: AnswerSubmissionInput,
  serializationRetries = 0,
): Promise<AnswerSubmissionResult> {
  if (
    !input.submissionKey ||
    input.submissionKey !== input.submissionKey.trim() ||
    input.submissionKey.length > 512 ||
    !/^[A-Za-z0-9._:-]+$/.test(input.submissionKey)
  ) {
    throw new AnswerSubmissionError('Invalid submission key', 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.adaptiveSession.findFirst({
        where: { id: input.sessionId, userId: input.userId },
      });
      if (!session) throw new AnswerSubmissionError('Teacher session not found', 404);

      const existingBySubmissionKey = await tx.questionAttempt.findFirst({
        where: {
          userId: input.userId,
          submissionKey: input.submissionKey,
        },
      });
      if (existingBySubmissionKey) {
        return {
          attemptId: existingBySubmissionKey.id,
          isCorrect: existingBySubmissionKey.isCorrect,
          selectedOption: existingBySubmissionKey.selectedOption,
          duplicate: true,
          submissionKey: existingBySubmissionKey.submissionKey || input.submissionKey,
        };
      }

      const attempt = await tx.questionAttempt.create({
        data: {
          userId: input.userId,
          sessionId: input.sessionId,
          questionId: input.questionId,
          selectedOption: input.selectedOption,
          isCorrect: input.isCorrect,
          timeTaken: input.timeTaken,
          submissionKey: input.submissionKey,
        },
      });

      await tx.learningHint.updateMany({
        where: {
          userId: input.userId,
          questionId: input.questionId,
          answeredAt: null,
          sessionId: input.sessionId,
        },
        data: {
          answeredAt: new Date(),
          answeredCorrect: input.isCorrect,
        },
      });

      await tx.adaptiveSession.update({
        where: { id: input.sessionId },
        data: {
          totalQ: { increment: 1 },
          correctQ: input.isCorrect ? { increment: 1 } : undefined,
          focusConceptId: input.isCorrect ? null : input.conceptId || session.focusConceptId,
        },
      });

      if (input.conceptId !== null) {
        await tx.$executeRaw`
          INSERT INTO user_concept_stats (id, "userId", "conceptId", total, correct, "updatedAt")
          VALUES (gen_random_uuid()::text, ${input.userId}, ${input.conceptId}, 1, ${input.isCorrect ? 1 : 0}, now())
          ON CONFLICT ("userId", "conceptId") WHERE "conceptId" IS NOT NULL
          DO UPDATE SET total = user_concept_stats.total + 1,
                        correct = user_concept_stats.correct + ${input.isCorrect ? 1 : 0},
                        "updatedAt" = now()`;
      } else if (input.chapterId) {
        await tx.$executeRaw`
          INSERT INTO user_concept_stats (id, "userId", "chapterId", total, correct, "updatedAt")
          VALUES (gen_random_uuid()::text, ${input.userId}, ${input.chapterId}, 1, ${input.isCorrect ? 1 : 0}, now())
          ON CONFLICT ("userId", "chapterId") WHERE "chapterId" IS NOT NULL
          DO UPDATE SET total = user_concept_stats.total + 1,
                        correct = user_concept_stats.correct + ${input.isCorrect ? 1 : 0},
                        "updatedAt" = now()`;
      }

      await tx.userActivity.create({
        data: {
          userId: input.userId,
          type: 'QUESTION_ANSWERED',
          metadata: {
            questionId: input.questionId,
            isCorrect: input.isCorrect,
            teacherSession: true,
          },
        },
      });

      if (input.conceptId !== null) {
        const [conceptStat, existingRevision, incorrectAttempts] = await Promise.all([
          tx.userConceptStat.findUnique({
            where: {
              userId_conceptId: {
                userId: input.userId,
                conceptId: input.conceptId,
              },
            },
          }),
          tx.conceptRevision.findUnique({
            where: {
              userId_conceptId: {
                userId: input.userId,
                conceptId: input.conceptId,
              },
            },
          }),
          tx.questionAttempt.findMany({
            where: { userId: input.userId, isCorrect: false },
            select: { question: { select: { conceptId: true } } },
          }),
        ]);
        const attemptCount = conceptStat?.total || 1;
        const mastery = conceptStat && conceptStat.total > 0
          ? Math.round((conceptStat.correct / conceptStat.total) * 100)
          : null;
        const repeatedMistakes = incorrectAttempts.filter(
          (attempt) => attempt.question.conceptId === input.conceptId,
        ).length;

        const revision = scheduleRevision({
          conceptId: input.conceptId,
          mastery,
          previousMastery: existingRevision?.masterySnapshot ?? null,
          attemptCount,
          lastResultCorrect: input.isCorrect,
          lastReviewedAt: new Date(),
          lastIncorrectAt: input.isCorrect ? null : new Date(),
          repeatedMistakes,
          consecutiveSuccesses: input.isCorrect
            ? (existingRevision?.consecutiveSuccesses || 0) + 1
            : 0,
          existingIntervalDays: existingRevision?.intervalDays ?? null,
        }, new Date(), attemptCount >= 6 ? 'high' : attemptCount >= 3 ? 'medium' : 'low');

        await tx.conceptRevision.upsert({
          where: { userId_conceptId: { userId: input.userId, conceptId: input.conceptId } },
          create: {
            userId: input.userId,
            conceptId: input.conceptId,
            masterySnapshot: mastery,
            intervalDays: revision.intervalDays,
            consecutiveSuccesses: input.isCorrect ? 1 : 0,
            dueAt: revision.dueAt,
            lastReviewedAt: new Date(),
            lastResultCorrect: input.isCorrect,
          },
          update: {
            masterySnapshot: mastery,
            intervalDays: revision.intervalDays,
            consecutiveSuccesses: input.isCorrect
              ? (existingRevision?.consecutiveSuccesses || 0) + 1
              : 0,
            dueAt: revision.dueAt,
            lastReviewedAt: new Date(),
            lastResultCorrect: input.isCorrect,
          },
        });

        await tx.studentLearningMemory.upsert({
          where: {
            userId_type_conceptId_key: {
              userId: input.userId,
              type: input.isCorrect ? 'SUCCESSFUL_APPROACH' : 'REPEATED_MISTAKE',
              conceptId: input.conceptId,
              key: input.isCorrect ? 'successful-retrieval' : `incorrect-answer:${input.questionId}`,
            },
          },
          create: {
            userId: input.userId,
            conceptId: input.conceptId,
            type: input.isCorrect ? 'SUCCESSFUL_APPROACH' : 'REPEATED_MISTAKE',
            key: input.isCorrect ? 'successful-retrieval' : `incorrect-answer:${input.questionId}`,
            details: {
              questionId: input.questionId,
              selectedOption: input.selectedOption,
              result: input.isCorrect ? 'correct-answer' : 'incorrect-answer',
            },
          },
          update: {
            details: {
              questionId: input.questionId,
              selectedOption: input.selectedOption,
              result: input.isCorrect ? 'correct-answer' : 'incorrect-answer',
            },
            occurredAt: new Date(),
          },
        });
      }

      return {
        attemptId: attempt.id,
        isCorrect: attempt.isCorrect,
        selectedOption: attempt.selectedOption,
        duplicate: false,
        submissionKey: input.submissionKey,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof AnswerSubmissionError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')) {
      const existing = await prisma.questionAttempt.findFirst({
        where: {
          userId: input.userId,
          submissionKey: input.submissionKey,
        },
      });
      if (existing) {
        return {
          attemptId: existing.id,
          isCorrect: existing.isCorrect,
          selectedOption: existing.selectedOption,
          duplicate: true,
          submissionKey: existing.submissionKey || input.submissionKey,
        };
      }
      if (error.code === 'P2034' && serializationRetries < 2) {
        await new Promise((resolve) => setTimeout(resolve, 25 * (serializationRetries + 1)));
        return submitAnswerAtomically(prisma, input, serializationRetries + 1);
      }
    }
    throw error;
  }
}

export class AnswerSubmissionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
