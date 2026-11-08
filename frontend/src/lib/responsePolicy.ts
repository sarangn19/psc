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
  | 'PERFORMANCE_REQUEST'
  | 'UNCERTAINTY'
  | 'SESSION_STATE_INQUIRY'    // "which topic are we on?" / "what question are we solving?"
  | 'PRACTICE_SUBJECT_REQUEST' // "give me an English grammar question"
  | 'CHANGE_TOPIC'             // "change topic" / "let's do maths"
  | 'GENERAL';

export type ResponseAction =
  | 'RESPOND_CONVERSATIONALLY'
  | 'EXPLAIN_CONCEPT'
  | 'CLARIFY_CONFUSION'
  | 'GUIDE_WITH_EXAMPLE'
  | 'PROVIDE_HINT'
  | 'OFFER_PRACTICE'
  | 'START_PRACTICE'
  | 'START_PRACTICE_SUBJECT'   // start practice constrained to the requested subject
  | 'START_REVISION'
  | 'ENCOURAGE_STUDENT'
  | 'REPORT_SESSION_STATE'     // look up active question and report it
  | 'HANDLE_CHANGE_TOPIC';     // ask what subject, then start constrained practice

/** Generic practice nouns / fillers that are never themselves a subject name. */
const PRACTICE_NOUNS = new Set([
  'question', 'questions', 'quiz', 'practice', 'practise', 'topic', 'one', 'now', 'please',
  'test', 'me', 'us', 'a', 'an', 'the', 'some', 'new', 'another', 'next', 'hard', 'easy',
  'difficult', 'here', 'today',
]);

/**
 * Extracts the subject/topic phrase from a practice request message, or null
 * when the message is generic. Mirrors backend practiceSubjectResolver.ts.
 */
export function extractSubjectPhrase(message: string): string | null {
  let s = message.toLowerCase().trim().replace(/[.?!]+$/, '').trim();

  const hasPracticeSignal =
    /\b(question|questions|quiz|practice|practise)\b/.test(s) ||
    /\b(test me|quiz me)\b/.test(s) ||
    /\blet'?s (practice|practise|do|try)\b/.test(s) ||
    /\bi want to (practice|practise|do)\b/.test(s);
  if (!hasPracticeSignal) return null;

  let m = s.match(/(?:question|questions|quiz|practice|practise|topic)\s+(?:on|about|in|of|for)\s+(.+)$/);
  if (m) return cleanPhrase(m[1]);

  m = s.match(/(?:^|\s)(?:on|about|in|of)\s+(.+?)\s+(?:question|questions|quiz|practice|practise|topic)$/);
  if (m) return cleanPhrase(m[1]);

  const LEAD_INS = [
    /^(?:please\s+)?(?:can you|can i|could you)\s+give me an?\s+/,
    /^(?:please\s+)?(?:can you|can i|could you)\s+give me\s+/,
    /^(?:please\s+)?(?:can you|can i|could you)\s+/,
    /^give me an?\s+/,
    /^give me\s+/,
    /^get me an?\s+/,
    /^get me\s+/,
    /^i want to\s+/,
    /^i want an?\s+/,
    /^i want\s+/,
    /^i'?d like to\s+/,
    /^i'?d like an?\s+/,
    /^i'?d like\s+/,
    /^i would like to\s+/,
    /^i would like\s+/,
    /^let'?s do an?\s+/,
    /^let'?s do\s+/,
    /^let'?s try an?\s+/,
    /^let'?s try\s+/,
    /^let'?s\s+/,
    /^let us\s+/,
    /^please\s+/,
    /^practice\s+/,
    /^practise\s+/,
    /^quiz me on\s+/,
    /^quiz me\s+/,
    /^test me on\s+/,
    /^test me\s+/,
    /^do\s+/,
    /^try\s+/,
  ];
  let prev: string;
  do {
    prev = s;
    for (const pat of LEAD_INS) {
      const trimmed = s.replace(pat, '').trim();
      if (trimmed !== s) { s = trimmed; break; }
    }
  } while (s && s !== prev);

  do {
    prev = s;
    s = s.replace(/^(on|about|in|of|for|regarding)\s+/, '').trim();
  } while (s && s !== prev);

  s = s.replace(/^(a|an|the|some)\s+(?=\S)/, '').trim();

  do {
    prev = s;
    s = s.replace(/\s+(question|questions|quiz|practice|practise|topic|one|now|please)$/, '').trim();
  } while (s && s !== prev);

  if (!s) return null;
  if (PRACTICE_NOUNS.has(s)) return null;
  const DIFFICULTY = new Set(['hard', 'easy', 'medium', 'quick', 'random', 'more', 'new', 'good', 'another', 'next', 'nother']);
  const FILLER = new Set(['give', 'some', 'get', 'let', 'do', 'try', 'one', 'more', 'me', 'us', 'any']);
  const words = s.split(/\s+/);
  if (words.every((w) => PRACTICE_NOUNS.has(w) || DIFFICULTY.has(w) || FILLER.has(w))) return null;
  return s;
}
function cleanPhrase(phrase: string): string {
  let s = phrase.toLowerCase().trim().replace(/[.?!]+$/, '').trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\s+(question|questions|quiz|practice|practise|topic|one|now|please)$/, '').trim();
  } while (s && s !== prev);
  s = s.replace(/^(a|an|the|some)\s+/, '').trim();
  if (!s || PRACTICE_NOUNS.has(s)) return '';
  return s;
}

export function classifyTeachingIntent(message: string): TeachingIntent {
  const text = message.toLowerCase();

  // ── Session-state inquiry ──────────────────────────────────────────────────
  // Must NOT fire for recommendation questions like "which subject should I focus more"
  // Those contain subject/focus keywords but are asking for advice, not the current state.
  const isRecommendationQuestion = /\b(should i|should i focus|which should|what should|recommend|suggest|focus more|study more|work on|improve)\b/.test(text);
  if (
    !isRecommendationQuestion && (
      /\b(which|what)\s+(topic|subject|concept|question|chapter)\b/.test(text) ||
      /\bwhat\s+(are\s+we|am\s+i)\s+(focus|studying|learning|working|practicing|practising|doing)\b/.test(text) ||
      /\bwhich\s+(topic|question|subject)\s+(are\s+we|am\s+i)\b/.test(text) ||
      /\bwhat('?s| is) (?:the |this )?(current|active|present) (topic|question|subject|chapter)\b/.test(text) ||
      (/\bfocusing\b/.test(text) && /\b(topic|question|now|we|current)\b/.test(text) && !isRecommendationQuestion) ||
      (/\bworking on\b/.test(text) && /\b(topic|question|what|which)\b/.test(text))
    )
  ) {
    return 'SESSION_STATE_INQUIRY';
  }

  // ── Change-topic ──────────────────────────────────────────────────────────
  if (
    /\b(change|switch|swap)\s+(topic|subject|chapter|question|to)\b/.test(text) ||
    /\bchange topic\b/.test(text) ||
    /\b(let'?s|want to)\s+(do|try|practice|practise|study)\s+(something else|a different|another topic|another subject)\b/.test(text)
  ) {
    return 'CHANGE_TOPIC';
  }

  // ── Generic practice/adaptive start (no specific subject) ─────────────────
  // Catch these BEFORE subject-specific check so they go to loadNext() directly.
  if (
    /\b(start|begin|resume)\s+(adaptive|practice|practise|learning|quiz|session)\b/.test(text) ||
    /\badaptive\s+(learning|practice|practise|mode|session)\b/.test(text) ||
    text === 'start' ||
    text === 'begin' ||
    text === 'practice' ||
    text === 'practise'
  ) {
    return 'QUIZ_REQUEST';
  }

  // ── Explicit subject practice request ────────────────────────────────────
  // Must be checked BEFORE generic QUIZ_REQUEST so "give me an English
  // grammar question" does not collapse to a plain practice start.
  if (
    /\b(question|questions|quiz|practice|practise)\b/.test(text) &&
    !/^(another question|next question|continue practice)$/.test(text.trim())
  ) {
    const phrase = extractSubjectPhrase(message);
    if (phrase && phrase.length >= 3) {
      return 'PRACTICE_SUBJECT_REQUEST';
    }
  }

  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(text)) return 'GREETING';
  if (text.includes('hint')) return 'HINT_REQUEST';
  if (text.includes('explain') || text.includes('why')) return 'EXPLANATION_REQUEST';
  if (text.includes('example')) return 'GUIDED_PRACTICE_REQUEST';
  if (text.includes('another question') || text.includes('next question') || text.includes('quiz') || text.includes('practice')) return 'QUIZ_REQUEST';
  if (text.includes('revision') || text.includes('revise')) return 'REVISION_REQUEST';
  if (text.includes('too hard') || text.includes('confusing') || text.includes('do not understand') || text.includes("don't understand")) return 'CONFUSION';
  if (text.includes('performance') || text.includes('how am i doing') || text.includes('how many') || text.includes('weak') || text.includes('accuracy') || text.includes('doing well') || text.includes('get right')) return 'PERFORMANCE_REQUEST';
  if (text.includes("i don't know") || text.includes("i'm stuck") || text.includes('i cant solve') || text.includes("i can't solve") || text.includes('confused') || text.includes("don't understand") || text.includes('difficult') || text.includes('no idea') || text.includes("can't figure")) return 'UNCERTAINTY';
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
    case 'PRACTICE_SUBJECT_REQUEST':
      return 'START_PRACTICE_SUBJECT';
    case 'REVISION_REQUEST':
      return 'START_REVISION';
    case 'PERFORMANCE_REQUEST':
      return 'RESPOND_CONVERSATIONALLY';
    case 'UNCERTAINTY':
      return 'RESPOND_CONVERSATIONALLY';
    case 'ENCOURAGEMENT':
      return 'ENCOURAGE_STUDENT';
    case 'PAUSE_PRACTICE':
      return 'RESPOND_CONVERSATIONALLY';
    case 'SESSION_STATE_INQUIRY':
      return 'REPORT_SESSION_STATE';
    case 'CHANGE_TOPIC':
      return 'HANDLE_CHANGE_TOPIC';
    default:
      return 'RESPOND_CONVERSATIONALLY';
  }
}
