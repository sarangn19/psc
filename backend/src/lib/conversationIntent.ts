export type ConversationIntent =
  | 'GREETING'
  | 'DOUBT'
  | 'HINT_REQUEST'
  | 'EXPLANATION_REQUEST'
  | 'GENERAL_ACADEMIC'
  | 'CONTINUE_PRACTICE'
  | 'FEEDBACK'
  | 'SESSION_STATE_INQUIRY'   // "which topic are we on?" / "what question are we solving?"
  | 'PRACTICE_SUBJECT_REQUEST'// "give me an English grammar question"
  | 'CHANGE_TOPIC'            // "change topic" / "switch to maths"
  | 'GENERAL_CONVERSATION';

export function classifyIntent(message: string, history?: { sender: string; text: string }[]): ConversationIntent {
  const text = message.toLowerCase();

  // ── Session-state inquiry ──────────────────────────────────────────────────
  // Exclude recommendation questions ("which subject should I focus more")
  const isRecommendation = /\b(should i|should i focus|which should|what should|recommend|suggest|focus more|study more|work on more|improve)\b/.test(text);
  if (
    !isRecommendation && (
      /\b(which|what)\s+(topic|subject|concept|question|chapter)\b/.test(text) ||
      /\bwhat\s+(are\s+we|am\s+i)\s+(focus|studying|learning|working|practicing|practising|doing)\b/.test(text) ||
      /\bwhich\s+(topic|question|subject)\s+(are\s+we|am\s+i)\b/.test(text) ||
      /\bwhat('?s| is) (?:the |this )?(current|active|present) (topic|question|subject|chapter)\b/.test(text) ||
      (/\bfocusing\b/.test(text) && /\b(topic|question|now|we|current)\b/.test(text)) ||
      (/\bworking on\b/.test(text) && /\b(topic|question|what|which)\b/.test(text))
    )
  ) {
    return 'SESSION_STATE_INQUIRY';
  }

  // ── Change-topic request ──────────────────────────────────────────────────
  if (
    /\b(change|switch|swap)\s+(topic|subject|chapter|question|to)\b/.test(text) ||
    /\bchange topic\b/.test(text) ||
    /\bsomething else\b/.test(text) ||
    /\b(let'?s|want to)\s+(do|try|practice|practise|study)\s+(something else|a different|another topic|another subject)\b/.test(text)
  ) {
    return 'CHANGE_TOPIC';
  }

  // ── Explicit subject/topic practice request ───────────────────────────────
  // Checked BEFORE generic CONTINUE_PRACTICE so "give me an English grammar
  // question" routes here instead of CONTINUE_PRACTICE.
  // BUT checked AFTER EXPLANATION_REQUEST so "Explain this question" does not
  // fire a subject-request. Also exclude pure explanation phrases.
  if (
    /\b(question|questions|quiz|practice|practise)\b/.test(text) &&
    !/\b(explain|why|hint)\b/.test(text) &&
    !/^(another question|next question|continue practice)$/.test(text.trim())
  ) {
    // Sentence-starts-with-"question on/about" pattern: "Question on average"
    const questionOnPattern = /^questions?\s+(?:on|about|in|of|for)\s+\S/.test(text);
    // Generic lead-in stripped heuristic
    const withoutLeadIn = text
      .replace(/^(please\s+)?(can you\s+|give me|let'?s|i want to|i'd like|test me on|quiz me on|quiz me|test me)\s+/, '')
      .replace(/^(a|an|the|one|some)\s+/, '')
      .replace(/(question|questions|quiz|practice|practise|topic|on|about|in)(\s+.*)?$/, '')
      .trim();
    if (questionOnPattern || (withoutLeadIn.length >= 3 && !/^(hard|easy|medium|quick|random|more|new|good)\s*$/.test(withoutLeadIn))) {
      return 'PRACTICE_SUBJECT_REQUEST';
    }
  }

  const referencesQuestion = /\b(this|that|it|the question|the problem|last step|previous|above|these|those)\b/.test(text);
  const isPracticeExplanation = (text.includes('explain') || text.includes('why')) && (referencesQuestion || text.includes('option'));
  const isContextualFollowUp = /^(why|how|explain that|explain again|another example)\b/.test(text) && !referencesQuestion && (history?.length || 0) > 0;

  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(text)) return 'GREETING';
  if (text.includes('your name') || text.includes('who are you') || text.includes('what can you do') || text.includes('can you teach') || text.includes('how can you help')) return 'GREETING';
  if (text.includes('hint')) return 'HINT_REQUEST';
  if (isPracticeExplanation) return 'EXPLANATION_REQUEST';
  if (isContextualFollowUp) return 'DOUBT';
  if (text.includes('another question') || text.includes('next question') || text.includes('continue practice')) return 'CONTINUE_PRACTICE';
  if (text.includes('too hard') || text.includes('confusing') || text.includes('do not understand') || text.includes("don't understand")) return 'FEEDBACK';
  if (/\b(which subject|what subject|which topic|what topic|where|what area)\b.*\b(focus|study|improve|work on|practice|practise)\b/.test(text)) return 'GENERAL_ACADEMIC';
  if (text.includes('explain') || text.includes('what is') || text.includes('tell me about') || text.includes('photosynthesis') || text.includes('?')) return 'GENERAL_ACADEMIC';
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
      return explanation || 'I can help with that. Please point to the specific part you want clarified.';
    case 'CONTINUE_PRACTICE':
      return "Let's try another question to strengthen this concept.";
    case 'FEEDBACK':
      return 'Let me simplify. Focus on the key idea in the question and try once more.';
    case 'SESSION_STATE_INQUIRY':
      // The frontend handles this intent by calling /active-question and
      // composing a natural response from the authoritative data. This fallback
      // is only reached when the AI path is skipped.
      return conceptName
        ? `We are currently working on ${conceptName}.`
        : 'I don\'t see an active practice question right now. Would you like me to start one?';
    case 'PRACTICE_SUBJECT_REQUEST':
      return 'Let me find a question on that topic for you.';
    case 'CHANGE_TOPIC':
      return 'Sure, let\'s switch. Which subject or topic would you like to practice next?';
    case 'DOUBT': {
      const lower = message.toLowerCase();
      if (lower.includes('this') || lower.includes('that') || lower.includes('question') || lower.includes('explain')) {
        return explanation || 'I can help with that. Please point to the specific part you want clarified.';
      }
      return `I'm here to help with your study. Could you tell me a bit more about "${message.slice(0, 60)}"?`;
    }
    case 'GENERAL_ACADEMIC': {
      const lower = message.toLowerCase();
      if (lower.includes('photosynthesis')) return 'Photosynthesis is how plants use sunlight, water, and carbon dioxide to make food and release oxygen.';
      return `I can help explain "${message.slice(0, 80)}". What specific part would you like me to focus on?`;
    }
    case 'GENERAL_CONVERSATION': {
      const lower = message.toLowerCase();
      if (lower.includes('how are you') || lower.includes("how you doing") || lower.includes("what's up")) {
        return "I'm doing well and ready to help you learn. What would you like to study?";
      }
      return `I'm here to help with your study. You mentioned "${message.slice(0, 60)}" — what would you like to explore about it?`;
    }
    default:
      return "I'm here to help with your study. Feel free to ask a question or request a hint.";
  }
}
