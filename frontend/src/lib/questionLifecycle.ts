export interface LifecycleQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface AnsweredQuestionEntry {
  id: string;
  sender: 'teacher';
  text: string;
  kind: 'question';
  correct?: boolean;
  options: string[];
  selectedOption: number;
  correctOption: number;
  revealed: boolean;
  questionId: string;
  explanation?: string | null;
}

export function upsertAnsweredQuestion(
  messages: { id: string; kind?: string; questionId?: string; text: string }[],
  question: LifecycleQuestion,
  selectedOption: number,
  correctOption: number,
  isCorrect: boolean,
  explanation?: string | null,
): { id: string; kind: 'question'; text: string; correct: boolean; options: string[]; selectedOption: number; correctOption: number; revealed: boolean; questionId: string; explanation?: string | null }[] {
  const entry = {
    id: `answered-${question.id}`,
    kind: 'question' as const,
    text: question.text,
    correct: isCorrect,
    options: question.options,
    selectedOption,
    correctOption,
    revealed: true,
    questionId: question.id,
    explanation: explanation || null,
  };
  const existingIndex = messages.findIndex((m) => m.kind === 'question' && (m.questionId || m.text) === question.id);
  if (existingIndex >= 0) {
    const next = [...messages];
    next[existingIndex] = { ...next[existingIndex], ...entry, id: next[existingIndex].id };
    return next as any;
  }
  return [...messages, entry as any];
}
