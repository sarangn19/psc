export type TeachingIntent =
  | 'GREETING'
  | 'CASUAL_CONVERSATION'
  | 'CONCEPT_QUESTION'
  | 'DOUBT'
  | 'CONFUSION'
  | 'HINT_REQUEST'
  | 'EXPLANATION_REQUEST'
  | 'GUIDED_PRACTICE_REQUEST'
  | 'QUIZ_REQUEST'
  | 'REVISION_REQUEST'
  | 'ENCOURAGEMENT'
  | 'PAUSE_PRACTICE'
  | 'GENERAL';

export type ResponseAction =
  | 'RESPOND_CONVERSATIONALLY'
  | 'EXPLAIN_CONCEPT'
  | 'CLARIFY_CONFUSION'
  | 'GUIDE_WITH_EXAMPLE'
  | 'PROVIDE_HINT'
  | 'OFFER_PRACTICE'
  | 'START_PRACTICE'
  | 'START_REVISION'
  | 'ENCOURAGE_STUDENT';

export function classifyTeachingIntent(message: string): TeachingIntent {
  const text = message.toLowerCase();
  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(text)) return 'GREETING';
  if (text.includes('hint')) return 'HINT_REQUEST';
  if (text.includes('explain') || text.includes('why')) return 'EXPLANATION_REQUEST';
  if (text.includes('example')) return 'GUIDED_PRACTICE_REQUEST';
  if (text.includes('another question') || text.includes('quiz') || text.includes('practice')) return 'QUIZ_REQUEST';
  if (text.includes('revision') || text.includes('revise')) return 'REVISION_REQUEST';
  if (text.includes('too hard') || text.includes('confusing') || text.includes('do not understand') || text.includes("don't understand")) return 'CONFUSION';
  if (text.includes('?')) return 'CONCEPT_QUESTION';
  if (text.includes('thanks') || text.includes('thank you')) return 'ENCOURAGEMENT';
  if (text.includes('stop') || text.includes('pause')) return 'PAUSE_PRACTICE';
  return 'GENERAL';
}

export function determineResponseAction(intent: TeachingIntent): ResponseAction {
  switch (intent) {
    case 'GREETING':
    case 'CASUAL_CONVERSATION':
    case 'GENERAL':
      return 'RESPOND_CONVERSATIONALLY';
    case 'CONCEPT_QUESTION':
    case 'EXPLANATION_REQUEST':
      return 'EXPLAIN_CONCEPT';
    case 'DOUBT':
    case 'CONFUSION':
      return 'CLARIFY_CONFUSION';
    case 'GUIDED_PRACTICE_REQUEST':
      return 'GUIDE_WITH_EXAMPLE';
    case 'HINT_REQUEST':
      return 'PROVIDE_HINT';
    case 'QUIZ_REQUEST':
      return 'START_PRACTICE';
    case 'REVISION_REQUEST':
      return 'START_REVISION';
    case 'ENCOURAGEMENT':
      return 'ENCOURAGE_STUDENT';
    case 'PAUSE_PRACTICE':
      return 'RESPOND_CONVERSATIONALLY';
    default:
      return 'RESPOND_CONVERSATIONALLY';
  }
}
