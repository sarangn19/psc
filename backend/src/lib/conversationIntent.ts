export type ConversationIntent =
  | 'GREETING'
  | 'DOUBT'
  | 'HINT_REQUEST'
  | 'EXPLANATION_REQUEST'
  | 'CONTINUE_PRACTICE'
  | 'FEEDBACK'
  | 'GENERAL_CONVERSATION';

export function classifyIntent(message: string): ConversationIntent {
  const text = message.toLowerCase();
if (/\b(hi|hello|hey|good morning|good evening)\b/.test(text)) return 'GREETING';
  if (text.includes('your name') || text.includes('who are you') || text.includes('what can you do') || text.includes('can you teach') || text.includes('how can you help')) return 'GREETING';
  if (text.includes('hint')) return 'HINT_REQUEST';
  if (text.includes('explain') || text.includes('why')) return 'EXPLANATION_REQUEST';
  if (text.includes('another question') || text.includes('next question') || text.includes('continue practice')) return 'CONTINUE_PRACTICE';
  if (text.includes('too hard') || text.includes('confusing') || text.includes('do not understand') || text.includes("don't understand")) return 'FEEDBACK';
  if (text.includes('?')) return 'DOUBT';
  return 'GENERAL_CONVERSATION';
}

export function composeConversationResponse(intent: ConversationIntent, message: string, questionText?: string | null, explanation?: string | null, conceptName?: string | null): string {
  switch (intent) {
    case 'GREETING': {
      const lower = message.toLowerCase();
      if (lower.includes('name') || lower.includes('who are you')) return "I'm Cognix, your AI Teacher! I can help you understand concepts, solve doubts and practise for your exams.";
      if (lower.includes('what can you do') || lower.includes('how can you help')) return "I can explain difficult topics, give you hints, work through examples, help you practise and discuss your learning progress.";
      if (lower.includes('teach')) return "Absolutely! We can work through that subject step by step. What topic would you like to start with?";
      return "Hey! Good to see you. Ready to learn something today?";
    }
    case 'HINT_REQUEST':
      return explanation
        ? `Hint: ${explanation.split('.')[0]}. Try applying that idea to the question.`
        : 'Hint: Read the question carefully and compare each option with the given information.';
    case 'EXPLANATION_REQUEST':
      return explanation || 'I can explain this using the stored question details. Please review the explanation shown with the question.';
    case 'CONTINUE_PRACTICE':
      return "Let's try another question to strengthen this concept.";
    case 'FEEDBACK':
      return 'Let me simplify. Focus on the key idea in the question and try once more.';
    case 'DOUBT': {
      const lower = message.toLowerCase();
      if (lower.includes('this') || lower.includes('that') || lower.includes('question') || lower.includes('explain')) {
        return explanation || 'I can help with that. Please point to the specific part you want clarified.';
      }
      return "I'm here to help with your study. You can ask for a hint, explanation, or another question.";
    }
    case 'GENERAL_CONVERSATION': {
      const lower = message.toLowerCase();
      if (lower.includes('how are you') || lower.includes("how you doing") || lower.includes("what's up")) {
        return "I'm doing well and ready to help you learn. What would you like to study?";
      }
      return "I'm here to help with your study. You can ask for a hint, explanation, or another question.";
    }
    default:
      return "I'm here to help with your study. You can ask for a hint, explanation, or another question.";
  }
}
