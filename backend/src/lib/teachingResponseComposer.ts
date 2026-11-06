export interface AnswerFeedbackInput {
  questionText: string;
  options: string[];
  selectedOption: number;
  correctOption: number;
  isCorrect: boolean;
  explanation?: string | null;
  conceptName?: string | null;
}

export function composeAnswerFeedback(input: AnswerFeedbackInput): string {
  const selectedValue = input.options[input.selectedOption];
  const correctValue = input.options[input.correctOption];
  const concept = input.conceptName ? ` on ${input.conceptName}` : '';
  if (input.isCorrect) {
    return `Correct. You chose ${String.fromCharCode(65 + input.selectedOption)}: ${selectedValue}. ${input.explanation || `That matches the correct answer${concept}.`} Let's try a slightly harder question next.`;
  }
  return `That answer is incorrect. You chose ${String.fromCharCode(65 + input.selectedOption)}: ${selectedValue}, but the correct answer is ${String.fromCharCode(65 + input.correctOption)}: ${correctValue}. ${input.explanation || `Review the concept${concept} and try again.`} Let's practise this concept once more before moving forward.`;
}

export function composeQuestionIntroduction(questionText: string, conceptName?: string | null): string {
  if (conceptName) {
    return `Let's work through a question on ${conceptName}. Read carefully and choose the best option.`;
  }
  return 'Read the question carefully and choose the best option.';
}

export function composeWelcome(conceptName?: string | null): string {
  if (conceptName) {
    return `Hi! We'll work through ${conceptName} together. I'll explain the idea, then we'll try one question at a time.`;
  }
  return "Hi! Let's start with a friendly lesson. I'll choose a useful topic and guide you one question at a time.";
}