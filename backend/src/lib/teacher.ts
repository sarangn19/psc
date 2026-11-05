import { Difficulty } from '@prisma/client';

export function scoreAnswer(selectedOption: number, correctOption: number): boolean {
  return Number.isInteger(selectedOption) && selectedOption === Number(correctOption);
}

export function nextDifficulty(previous: Difficulty | undefined, wasCorrect: boolean): Difficulty {
  if (previous === Difficulty.HARD) return wasCorrect ? Difficulty.HARD : Difficulty.MEDIUM;
  if (previous === Difficulty.EASY) return wasCorrect ? Difficulty.MEDIUM : Difficulty.EASY;
  return wasCorrect ? Difficulty.HARD : Difficulty.EASY;
}

export function buildDayPlan(chapters: { id: string; name: string }[], targetDate: string, weakNames: string[] = []) {
  const target = new Date(`${targetDate}T00:00:00`);
  const days = Math.max(1, Math.ceil((target.getTime() - Date.now()) / 86400000));
  const today = new Date();
  return Array.from({ length: Math.min(7, Math.max(7, chapters.length)) }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + Math.round(index * Math.max(1, days / 7)));
    const chapter = chapters[index % Math.max(1, chapters.length)];
    return {
      date: date.toISOString().slice(0, 10),
      title: index === 3 && weakNames[0] ? `Spaced review: ${weakNames[0]}` : `Lesson ${index + 1}: ${chapter?.name || 'Mixed review'}`,
      type: index === 3 ? 'review' : 'lesson',
      completed: false,
    };
  });
}
