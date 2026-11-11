import prisma from './prisma';

/**
 * Centralized source of truth for student-eligible (LEARNED) chapters.
 * Uses persisted UserChapter status. Legacy isLearned=true is treated as LEARNED.
 */
export async function getEligibleLearnedChapterIds(
  studentId: string,
  examId?: string,
  subjectId?: string
): Promise<string[]> {
  const userChapters = await prisma.userChapter.findMany({
    where: { userId: studentId, OR: [{ status: 'LEARNED' }, { isLearned: true }] },
    select: { chapterId: true },
  });

  let chapterIds = userChapters.map((uc) => uc.chapterId);
  if (chapterIds.length === 0) return [];

  // Optional hierarchy filters
  if (examId || subjectId) {
    const chapters = await prisma.chapter.findMany({
      where: {
        id: { in: chapterIds },
        ...(subjectId ? { subjectId } : {}),
        ...(examId ? { subject: { examId } } : {}),
      },
      select: { id: true },
    });
    chapterIds = chapters.map((c) => c.id);
  }

  return chapterIds;
}

export async function isChapterLearned(studentId: string, chapterId: string): Promise<boolean> {
  const uc = await prisma.userChapter.findUnique({
    where: { userId_chapterId: { userId: studentId, chapterId } },
    select: { status: true, isLearned: true },
  });
  if (!uc) return false;
  return uc.status === 'LEARNED' || uc.isLearned === true;
}
