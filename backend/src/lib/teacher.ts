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

export function validatePracticeQuestion(input: {
  text?: unknown;
  options?: unknown;
  correctOption?: unknown;
}): { valid: boolean; options: string[] } {
  const stem = typeof input.text === 'string' ? input.text.trim() : '';
  let options: unknown = input.options;
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options);
    } catch {
      options = [];
    }
  }
  const normalized = Array.isArray(options)
    ? options.map((option) => typeof option === 'string' ? option.trim() : '').filter(Boolean)
    : [];
  const correctOption = Number(input.correctOption);
  const uniqueOptions = new Set(normalized.map((option) => option.toLowerCase().replace(/\s+/g, ' ')));
  const stemLower = stem.toLowerCase().replace(/[?.!:\s]+/g, ' ').trim();
  const valid = stem.length >= 10
    && normalized.length >= 2
    && normalized.length <= 8
    && uniqueOptions.size === normalized.length
    && Number.isInteger(correctOption)
    && correctOption >= 0
    && correctOption < normalized.length
    && normalized.every((option) => option.length >= 1 && option.toLowerCase().replace(/[?.!:\s]+/g, ' ').trim() !== stemLower);

  return { valid, options: normalized };
}

export function optionName(options: string[], index: number): string {
  return options[index]?.trim() || `${String.fromCharCode(65 + index)} (unavailable option text)`;
}

export const TEACHER_RESPONSE_RULES = `
Correct answer: acknowledge the actual selected option, verify the idea, praise specifically, then advance or raise difficulty.
Wrong answer: name the actual selected choice, say what it means, state the correct answer in words, explain the mix-up, and stay on the same topic.
Hint request: give a useful hint without revealing the answer.
Too hard: simplify, re-explain, and offer a quick win.
Long break: briefly recap what happened before and resume without restarting.
Every turn must end with a question, hint offer, or short check-in.
`;
