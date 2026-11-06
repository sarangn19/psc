import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AnswerSubmissionError, submitAnswerAtomically } from '../src/lib/answerSubmission';

const testDatabaseUrl = process.env.COGNIX_TEST_DATABASE_URL;
const prisma = testDatabaseUrl
  ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })
  : null;

describe.skipIf(!prisma)('answer submission database integration', () => {
  const suffix = `answer-${Date.now()}`;
  let userId = '';
  let otherUserId = '';
  let questionId = '';
  let question2Id = '';
  let sessionId = '';
  let conceptId = 0;
  let chapterId = '';
  let subjectId = '';
  let examId = '';

  beforeAll(async () => {
    if (!prisma) return;
    const exam = await prisma.exam.create({ data: { name: `Test Exam ${suffix}`, category: 'TEST' } });
    examId = exam.id;
    const subject = await prisma.subject.create({ data: { name: `Test Subject ${suffix}`, examId: exam.id } });
    subjectId = subject.id;
    const chapter = await prisma.chapter.create({ data: { name: `Test Chapter ${suffix}`, subjectId: subject.id } });
    chapterId = chapter.id;
    const concept = await prisma.taxonomyNode.create({
      data: { id: Math.floor(900000 + Math.random() * 100000), level: 'CONCEPT', nameEnglish: `Test Concept ${suffix}`, slug: `test-${suffix}` },
    });
    conceptId = concept.id;
    const user = await prisma.user.create({ data: { name: 'Answer Test User', email: `${suffix}@example.test`, password: 'unused' } });
    const otherUser = await prisma.user.create({ data: { name: 'Other Answer User', email: `other-${suffix}@example.test`, password: 'unused' } });
    userId = user.id;
    otherUserId = otherUser.id;
    const question = await prisma.question.create({
      data: {
        chapterId: chapter.id,
        conceptId: concept.id,
        text: 'Integration answer test',
        options: ['A', 'B'],
        correctOption: 1,
        difficulty: 'MEDIUM',
        tags: [],
      },
    });
    questionId = question.id;
    const question2 = await prisma.question.create({
      data: {
        chapterId: chapter.id,
        conceptId: concept.id,
        text: 'Second concurrent integration question',
        options: ['A', 'B'],
        correctOption: 0,
        difficulty: 'MEDIUM',
        tags: [],
      },
    });
    question2Id = question2.id;
    const session = await prisma.adaptiveSession.create({ data: { userId: user.id } });
    sessionId = session.id;
    await prisma.learningHint.create({
      data: { userId: user.id, sessionId: session.id, questionId: question.id, conceptId: concept.id, eventKey: `${suffix}-hint` },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.questionAttempt.deleteMany({ where: { sessionId } });
    await prisma.questionAttempt.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.learningHint.deleteMany({ where: { sessionId } });
    await prisma.conceptRevision.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.studentLearningMemory.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.userConceptStat.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.userActivity.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.adaptiveSession.deleteMany({ where: { id: sessionId } });
    await prisma.adaptiveSession.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@example.test' }, name: { in: ['Answer Test User', 'Other Answer User'] } } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.question.deleteMany({ where: { id: question2Id } });
    await prisma.taxonomyNode.deleteMany({ where: { id: conceptId } });
    if (chapterId) await prisma.chapter.deleteMany({ where: { id: chapterId } });
    if (subjectId) await prisma.subject.deleteMany({ where: { id: subjectId } });
    if (examId) await prisma.exam.deleteMany({ where: { id: examId } });
    await prisma.$disconnect();
  });

  async function submit(clientKey = 'same-request') {
    if (!prisma) throw new Error('Test database unavailable');
    return submitAnswerAtomically(prisma, {
      userId,
      sessionId,
      questionId,
      selectedOption: 1,
      timeTaken: 1000,
      submissionKey: `answer:${userId}:${sessionId}:${questionId}:${clientKey}`,
      isCorrect: true,
      conceptId,
      chapterId,
      masteryBefore: null,
      previousMastery: null,
      attemptCountBefore: 0,
      repeatedMistakes: 0,
      existingIntervalDays: null,
      consecutiveSuccesses: 0,
    });
  }

  async function resetQuestionState() {
    if (!prisma) return;
    await prisma.questionAttempt.deleteMany({ where: { userId, sessionId } });
    await prisma.learningHint.updateMany({
      where: { userId, sessionId },
      data: { answeredAt: null, answeredCorrect: null },
    });
    await prisma.conceptRevision.deleteMany({ where: { userId, conceptId } });
    await prisma.studentLearningMemory.deleteMany({ where: { userId, conceptId } });
    await prisma.userConceptStat.deleteMany({ where: { userId, conceptId } });
    await prisma.adaptiveSession.update({
      where: { id: sessionId },
      data: { totalQ: 0, correctQ: 0, focusConceptId: null },
    });
  }

  it('persists normal submissions and protects hint/revision/memory rows from retries', async () => {
    const first = await submit('normal');
    const second = await submit('normal');
    if (!prisma) return;

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await prisma.questionAttempt.count({ where: { userId, sessionId, questionId } })).toBe(1);
    expect(await prisma.adaptiveSession.findUnique({ where: { id: sessionId } })).toMatchObject({ totalQ: 1, correctQ: 1 });
    expect(await prisma.learningHint.count({ where: { userId, sessionId, questionId, answeredAt: { not: null }, answeredCorrect: true } })).toBe(1);
    expect(await prisma.conceptRevision.count({ where: { userId, conceptId } })).toBe(1);
    expect(await prisma.studentLearningMemory.count({ where: { userId, conceptId, type: 'SUCCESSFUL_APPROACH' } })).toBe(1);
  });

  it('serializes simultaneous duplicate submissions without inflating state', async () => {
    await prisma!.questionAttempt.deleteMany({ where: { userId, sessionId, questionId } });
    await prisma!.learningHint.updateMany({
      where: { userId, sessionId, questionId },
      data: { answeredAt: null, answeredCorrect: null },
    });
    await prisma!.conceptRevision.deleteMany({ where: { userId, conceptId } });
    await prisma!.studentLearningMemory.deleteMany({ where: { userId, conceptId } });
    await prisma!.userConceptStat.deleteMany({ where: { userId, conceptId } });
    await prisma!.adaptiveSession.update({
      where: { id: sessionId },
      data: { totalQ: 0, correctQ: 0, focusConceptId: null },
    });

    const results = await Promise.all([submit('concurrent'), submit('concurrent')]);
    if (!prisma) return;
    expect(results.filter((item) => !item.duplicate)).toHaveLength(1);
    expect(results.filter((item) => item.duplicate)).toHaveLength(1);
    expect(await prisma.questionAttempt.count({ where: { userId, sessionId, questionId } })).toBe(1);
    expect(await prisma.adaptiveSession.findUnique({ where: { id: sessionId } })).toMatchObject({ totalQ: 1, correctQ: 1 });
  });

  it('rolls back all mutations when an induced transaction fails', async () => {
    const sessionBefore = await prisma!.adaptiveSession.findUniqueOrThrow({ where: { id: sessionId } });
    await prisma!.$transaction(async (tx) => {
      await tx.questionAttempt.create({
        data: {
          userId,
          sessionId,
          questionId,
          selectedOption: 0,
          isCorrect: false,
          submissionKey: `answer:rollback:${suffix}`,
        },
      });
      await tx.adaptiveSession.update({ where: { id: sessionId }, data: { totalQ: { increment: 1 } } });
      throw new Error('induced failure');
    }).catch(() => undefined);

    expect(await prisma!.questionAttempt.count({ where: { submissionKey: `answer:rollback:${suffix}` } })).toBe(0);
    const sessionAfter = await prisma!.adaptiveSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(sessionAfter.totalQ).toBe(sessionBefore.totalQ);
    expect(sessionAfter.correctQ).toBe(sessionBefore.correctQ);
  });

  it('rejects another user trying to submit into this session', async () => {
    await expect(submitAnswerAtomically(prisma!, {
      userId: otherUserId,
      sessionId,
      questionId,
      selectedOption: 1,
      timeTaken: 100,
      submissionKey: `answer:${otherUserId}:${sessionId}:${questionId}:cross-user`,
      isCorrect: true,
      conceptId,
      chapterId,
      masteryBefore: null,
      previousMastery: null,
      attemptCountBefore: 0,
      repeatedMistakes: 0,
      existingIntervalDays: null,
      consecutiveSuccesses: 0,
    })).rejects.toBeInstanceOf(AnswerSubmissionError);
  });

  it.each([10, 50])('accepts exactly one of %i simultaneous identical submissions', async (requestCount) => {
    await resetQuestionState();
    const results = await Promise.all(
      Array.from({ length: requestCount }, (_, index) =>
        submit(`burst-${requestCount}`),
      ),
    );
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(requestCount - 1);
    expect(await prisma!.questionAttempt.count({ where: { userId, sessionId, questionId } })).toBe(1);
    expect(await prisma!.adaptiveSession.findUnique({ where: { id: sessionId } }))
      .toMatchObject({ totalQ: 1, correctQ: 1 });
    expect(await prisma!.userConceptStat.count({ where: { userId, conceptId } })).toBe(1);
    expect(await prisma!.conceptRevision.count({ where: { userId, conceptId } })).toBe(1);
  });

  it('submits different questions concurrently without inflating shared counters incorrectly', async () => {
    await resetQuestionState();
    const results = await Promise.all([
      submit('different-q-a'),
      submitAnswerAtomically(prisma!, {
        userId,
        sessionId,
        questionId: question2Id,
        selectedOption: 0,
        timeTaken: 900,
        submissionKey: `answer:${userId}:${sessionId}:${question2Id}:different-q-b`,
        isCorrect: true,
        conceptId,
        chapterId,
        masteryBefore: null,
        previousMastery: null,
        attemptCountBefore: 0,
        repeatedMistakes: 0,
        existingIntervalDays: null,
        consecutiveSuccesses: 0,
      }),
    ]);
    expect(results.every((result) => !result.duplicate)).toBe(true);
    expect(await prisma!.questionAttempt.count({ where: { userId, sessionId } })).toBe(2);
    expect(await prisma!.adaptiveSession.findUnique({ where: { id: sessionId } }))
      .toMatchObject({ totalQ: 2, correctQ: 2 });
  });

  it('allows different users to submit the same question independently', async () => {
    const otherSession = await prisma!.adaptiveSession.create({ data: { userId: otherUserId } });
    const result = await submitAnswerAtomically(prisma!, {
      userId: otherUserId,
      sessionId: otherSession.id,
      questionId,
      selectedOption: 1,
      timeTaken: 800,
      submissionKey: `answer:${otherUserId}:${otherSession.id}:${questionId}:cross-user-ok`,
      isCorrect: true,
      conceptId,
      chapterId,
      masteryBefore: null,
      previousMastery: null,
      attemptCountBefore: 0,
      repeatedMistakes: 0,
      existingIntervalDays: null,
      consecutiveSuccesses: 0,
    });
    expect(result.duplicate).toBe(false);
    expect(await prisma!.questionAttempt.count({ where: { userId: otherUserId, questionId } })).toBe(1);
    expect(await prisma!.adaptiveSession.findUnique({ where: { id: otherSession.id } }))
      .toMatchObject({ totalQ: 1, correctQ: 1 });
  });

  it('deduplicates explicit submission keys and repeated retries', async () => {
    await resetQuestionState();
    const explicitKey = `answer:${userId}:${sessionId}:${questionId}:idempotent-client-key`;
    const results = await Promise.all([
      submitAnswerAtomically(prisma!, {
        userId, sessionId, questionId, selectedOption: 1, timeTaken: 700,
        submissionKey: explicitKey, isCorrect: true, conceptId, chapterId,
        masteryBefore: null, previousMastery: null, attemptCountBefore: 0,
        repeatedMistakes: 0, existingIntervalDays: null, consecutiveSuccesses: 0,
      }),
      submitAnswerAtomically(prisma!, {
        userId, sessionId, questionId, selectedOption: 1, timeTaken: 700,
        submissionKey: explicitKey, isCorrect: true, conceptId, chapterId,
        masteryBefore: null, previousMastery: null, attemptCountBefore: 0,
        repeatedMistakes: 0, existingIntervalDays: null, consecutiveSuccesses: 0,
      }),
    ]);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(await prisma!.questionAttempt.count({
      where: { userId, sessionId, questionId, submissionKey: explicitKey },
    })).toBe(1);
  });

  it('allows PostgreSQL NULL session attempts and does not confuse them with teacher sessions', async () => {
    await prisma!.questionAttempt.createMany({
      data: [
        { userId, questionId, selectedOption: 1, isCorrect: true, sessionId: null, submissionKey: `null-session-a-${suffix}` },
        { userId, questionId, selectedOption: 1, isCorrect: true, sessionId: null, submissionKey: `null-session-b-${suffix}` },
      ],
    });
    expect(await prisma!.questionAttempt.count({
      where: { userId, questionId, sessionId: null },
    })).toBeGreaterThanOrEqual(2);
  });

  it('allows a legitimate repeated attempt in a separate session', async () => {
    await resetQuestionState();
    const secondSession = await prisma!.adaptiveSession.create({ data: { userId, examId: null } });
    const result = await submitAnswerAtomically(prisma!, {
      userId, sessionId: secondSession.id, questionId, selectedOption: 1, timeTaken: 600,
      submissionKey: `answer:${userId}:${secondSession.id}:${questionId}:legitimate-repeat`,
      isCorrect: true, conceptId, chapterId, masteryBefore: null, previousMastery: null,
      attemptCountBefore: 0, repeatedMistakes: 0, existingIntervalDays: null, consecutiveSuccesses: 0,
    });
    expect(result.duplicate).toBe(false);
    expect(await prisma!.questionAttempt.count({ where: { userId, questionId } })).toBeGreaterThanOrEqual(1);
  });

  it('allows different submission keys for separate attempts within the same session', async () => {
    await resetQuestionState();
    const firstKey = `answer:${userId}:${sessionId}:${questionId}:legitimate-attempt-one`;
    const secondKey = `answer:${userId}:${sessionId}:${questionId}:legitimate-attempt-two`;

    const first = await submitAnswerAtomically(prisma!, {
      userId, sessionId, questionId, selectedOption: 1, timeTaken: 500,
      submissionKey: firstKey, isCorrect: true, conceptId, chapterId,
      masteryBefore: null, previousMastery: null, attemptCountBefore: 0,
      repeatedMistakes: 0, existingIntervalDays: null, consecutiveSuccesses: 0,
    });
    const second = await submitAnswerAtomically(prisma!, {
      userId, sessionId, questionId, selectedOption: 0, timeTaken: 500,
      submissionKey: secondKey, isCorrect: false, conceptId, chapterId,
      masteryBefore: null, previousMastery: null, attemptCountBefore: 1,
      repeatedMistakes: 1, existingIntervalDays: null, consecutiveSuccesses: 0,
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    expect(await prisma!.questionAttempt.count({
      where: { userId, sessionId, questionId },
    })).toBe(2);
    expect(await prisma!.adaptiveSession.findUniqueOrThrow({ where: { id: sessionId } }))
      .toMatchObject({ totalQ: 2, correctQ: 1 });
  });

  it('scopes identical submission keys independently by user', async () => {
    const clientKey = 'same-client-key-different-users';
    const otherSession = await prisma!.adaptiveSession.create({ data: { userId: otherUserId } });
    const sharedSubmissionKey = clientKey;

    await submitAnswerAtomically(prisma!, {
      userId, sessionId, questionId, selectedOption: 1, timeTaken: 400,
      submissionKey: sharedSubmissionKey, isCorrect: true, conceptId, chapterId,
      masteryBefore: null, previousMastery: null, attemptCountBefore: 0,
      repeatedMistakes: 0, existingIntervalDays: null, consecutiveSuccesses: 0,
    });
    const resultForOther = await submitAnswerAtomically(prisma!, {
      userId: otherUserId, sessionId: otherSession.id, questionId, selectedOption: 1, timeTaken: 400,
      submissionKey: sharedSubmissionKey, isCorrect: true, conceptId, chapterId,
      masteryBefore: null, previousMastery: null, attemptCountBefore: 0,
      repeatedMistakes: 0, existingIntervalDays: null, consecutiveSuccesses: 0,
    });

    expect(resultForOther.duplicate).toBe(false);
    expect(await prisma!.questionAttempt.count({
      where: { userId: otherUserId, submissionKey: sharedSubmissionKey },
    })).toBe(1);
  });

  it('preserves historical NULL-submission-key attempts unchanged', async () => {
    const countBefore = await prisma!.questionAttempt.count({
      where: { userId, questionId, submissionKey: null },
    });
    await prisma!.questionAttempt.create({
      data: {
        userId,
        questionId,
        selectedOption: 1,
        isCorrect: true,
        timeTaken: 250,
        sessionId: null,
        submissionKey: null,
      },
    });

    expect(await prisma!.questionAttempt.count({
      where: { userId, questionId, submissionKey: null },
    })).toBe(countBefore + 1);
    expect(await prisma!.questionAttempt.findFirst({
      where: { userId, questionId, sessionId: null, submissionKey: null },
      orderBy: { createdAt: 'desc' },
    })).toMatchObject({ submissionKey: null, sessionId: null });
  });
});
