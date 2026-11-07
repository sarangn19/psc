export type MessageIntent = 'GREETING' | 'HINT_REQUEST' | 'EXPLANATION_REQUEST' | 'CONTINUE_PRACTICE' | 'FEEDBACK' | 'DOUBT' | 'PERFORMANCE_REQUEST' | 'GENERAL_CONVERSATION';

export function classifyMessageIntent(message: string): MessageIntent {
  const text = message.toLowerCase();
  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(text)) return 'GREETING';
  if (text.includes('hint')) return 'HINT_REQUEST';
  if (text.includes('explain') || text.includes('why')) return 'EXPLANATION_REQUEST';
  if (text.includes('another question') || text.includes('next question') || text.includes('continue practice')) return 'CONTINUE_PRACTICE';
  if (text.includes('too hard') || text.includes('confusing') || text.includes('do not understand') || text.includes("don't understand")) return 'FEEDBACK';
  if (text.includes('performance') || text.includes('how am i doing') || text.includes('how many') || text.includes('weak')) return 'PERFORMANCE_REQUEST';
  if (text.includes('?')) return 'DOUBT';
  return 'GENERAL_CONVERSATION';
}
