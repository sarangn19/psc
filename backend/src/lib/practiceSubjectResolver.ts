// Resolves an explicit subject/topic request from a student message into a
// database-backed constraint, so practice-question selection can be limited to
// verified question-bank content for the requested subject.
//
// This is the authoritative counterpart to the frontend practice-subject
// extractor: the frontend only decides whether a message *looks* like a
// subject-specific practice request (for the "already have a question" guard);
// the actual subject name -> DB constraint resolution happens here, against
// the verified taxonomy, chapters and subjects that own active questions.
//
// No subject names are hardcoded. Matching is normalised string equality or
// containment against Subject / Chapter / TaxonomyNode names (and taxonomy
// aliases), scoped to the student's selected exams when those exist.
import prisma from './prisma';
import { validatePracticeQuestion } from './teacher';

export type ResolvedSubjectKind = 'subject' | 'chapter' | 'concept';

export interface ResolvedSubject {
  type: 'resolved';
  kind: ResolvedSubjectKind;
  subjectId?: string;
  chapterId?: string;
  conceptId?: number;
  matchedName: string;
  phrase: string;
  allMatches?: Array<{ kind: ResolvedSubjectKind; subjectId?: string; chapterId?: string; conceptId?: number; matchedName: string }>;
}

export type ResolvedSubjectResult =
  | { type: 'none' } // no specific subject detected in the message -> adaptive
  | ResolvedSubject
  | { type: 'unresolved'; phrase: string }; // specific subject requested but not in the verified bank

// Generic practice nouns / fillers that are never themselves a subject. Used to
// reject "give me a question" (no subject) and similar generic requests.
const PRACTICE_NOUNS = new Set([
  'question', 'questions', 'quiz', 'practice', 'practise', 'topic', 'one', 'now', 'please',
  'test', 'me', 'us', 'a', 'an', 'the', 'some', 'new', 'another', 'next', 'hard', 'easy',
  'difficult', 'here', 'today',
]);

/**
 * Extracts the subject/topic phrase from a practice request message, or null
 * when the message is a generic practice request with no specific subject.
 *
 * Pure and side-effect free; mirrored on the frontend (src/lib/practiceSubject.ts)
 * so the guard logic there stays in sync. Patterns are general — they recognise
 * practice lead-ins and strip fillers; they never hardcode subject names.
 */
export function extractSubjectPhrase(message: string): string | null {
  let s = message.toLowerCase().trim().replace(/[.?!]+$/, '').trim();

  const hasPracticeSignal =
    /\b(question|questions|quiz|practice|practise)\b/.test(s) ||
    /\b(test me|quiz me)\b/.test(s) ||
    /\blets (practice|practise|do|try)\b/.test(s) ||
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
    /^lets do an?\s+/,
    /^lets do\s+/,
    /^lets try an?\s+/,
    /^lets try\s+/,
    /^lets\s+/,
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

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreMatch(query: string, name: string): 'exact' | 'contains' | 'partial' | 'none' {
  const nq = normalizeName(query);
  const nn = normalizeName(name);
  if (!nq || !nn) return 'none';
  if (nq === nn) return 'exact';
  // Full-string containment (one is a substring of the other) — only count it
  // when the shorter string is at least 5 chars to avoid "cat"→"category" etc.
  if (nq.length >= 5 && nn.includes(nq)) return 'contains';
  if (nn.length >= 5 && nq.includes(nn)) return 'contains';
  // Word-overlap: every word in the SHORTER phrase must appear in the longer.
  // This ensures "english grammar" matches "Grammar Basics" (shares "grammar")
  // but NOT "English Language" (shares only "english", missing "grammar").
  const qWords = nq.split(/\s+/).filter((w) => w.length >= 3);
  const nWords = nn.split(/\s+/).filter((w) => w.length >= 3);
  if (qWords.length > 0 && nWords.length > 0) {
    const shorter = qWords.length <= nWords.length ? qWords : nWords;
    const longerSet = new Set(qWords.length <= nWords.length ? nWords : qWords);
    const matchCount = shorter.filter((w) => longerSet.has(w)).length;
    // Require ALL words of the shorter phrase to match, or at least 2 words for
    // longer phrases (to handle "english grammar" vs "grammar basics": 1/2 match).
    if (shorter.length === 1 && matchCount === 1) return 'contains';
    if (shorter.length >= 2 && matchCount >= shorter.length) return 'contains';
    // Partial: ≥1 matching word from a multi-word query — ranked lower than full match
    if (shorter.length >= 2 && matchCount >= 1) return 'partial';
  }
  return 'none';
}

// Specificity ranking. More specific matches are preferred so that a concept
// ("Average") wins over a chapter, which wins over a whole subject. Among
// taxonomy levels a CONCEPT outranks a TOPIC. Subject-model (the Exam->Subject
// relation that questions are grouped under) outranks a taxonomy SUBJECT node,
// because subject filtering uses chapter.subjectId, not the taxonomy tree.
const TAXONOMY_RANK: Record<string, number> = {
  concept: 10,
  topic: 9,
  domain: 6,
  subject: 5,
  exam: 4,
};
const CHAPTER_RANK = 8;
const SUBJECT_MODEL_RANK = 7;

interface CandidateMatch {
  kind: ResolvedSubjectKind;
  rank: number;
  isExact: boolean;
  isPartial: boolean;
  conceptId?: number;
  chapterId?: string;
  subjectId?: string;
  matchedName: string;
}

/**
 * Resolves a (possibly full-message) requested-subject string into a DB
 * constraint. Returns 'none' when no specific subject is requested, 'resolved'
 * with the best matching subject/chapter/concept, or 'unresolved' when a
 * specific subject was requested but is not present in the verified bank.
 */
export async function resolveRequestedSubject(
  input: string,
  opts: { selectedExamIds: string[] },
): Promise<ResolvedSubjectResult> {
  const phrase = extractSubjectPhrase(input);
  if (!phrase) return { type: 'none' };

  const examFilter = opts.selectedExamIds.length ? { examId: { in: opts.selectedExamIds } } : {};
  // Chapter -> subject -> exam (for question queries, need chapter.subject.examId)
  const chapterExamFilter = opts.selectedExamIds.length
    ? { subject: { examId: { in: opts.selectedExamIds } } }
    : {};
  const questionExamFilter = opts.selectedExamIds.length
    ? { chapter: { subject: { examId: { in: opts.selectedExamIds } } } }
    : {};

  // Only consider subjects / chapters / concepts that actually own active
  // verified questions, so a resolved constraint is guaranteed to have content
  // (before per-student exclusions).
  const [subjects, chapters, conceptGroups] = await Promise.all([
    prisma.subject.findMany({
      where: { ...examFilter, chapters: { some: { questions: { some: { isActive: true } } } } },
      select: { id: true, name: true },
    }),
    prisma.chapter.findMany({
      where: { questions: { some: { isActive: true } }, ...chapterExamFilter },
      select: { id: true, name: true },
    }),
    prisma.question.groupBy({
      by: ['conceptId'],
      where: { isActive: true, conceptId: { not: null }, ...questionExamFilter },
      _count: { _all: true },
    }),
  ]);

  const conceptIds = conceptGroups
    .map((g) => g.conceptId)
    .filter((id): id is number => id !== null);
  const nodes = conceptIds.length
    ? await prisma.taxonomyNode.findMany({
        where: { id: { in: conceptIds } },
        select: { id: true, nameEnglish: true, aliases: true, level: true },
      })
    : [];

  const matches: CandidateMatch[] = [];

  for (const node of nodes) {
    let best: 'exact' | 'contains' | 'partial' | 'none' = 'none';
    const direct = scoreMatch(phrase, node.nameEnglish);
    if (direct !== 'none') best = direct;
    for (const alias of node.aliases || []) {
      const a = scoreMatch(phrase, alias);
      if (a !== 'none' && (best === 'none' || a === 'exact' || (a === 'contains' && best === 'partial'))) best = a;
    }
    if (best !== 'none') {
      const lvl = (node.level || 'CONCEPT').toLowerCase();
      const rank = TAXONOMY_RANK[lvl] ?? 6;
      matches.push({
        kind: 'concept',
        rank,
        isExact: best === 'exact',
        isPartial: best === 'partial',
        conceptId: node.id,
        matchedName: node.nameEnglish,
      });
    }
  }

  for (const ch of chapters) {
    const sc = scoreMatch(phrase, ch.name);
    if (sc !== 'none') {
      matches.push({ kind: 'chapter', rank: CHAPTER_RANK, isExact: sc === 'exact', isPartial: sc === 'partial', chapterId: ch.id, matchedName: ch.name });
    }
  }

  for (const sub of subjects) {
    const sc = scoreMatch(phrase, sub.name);
    if (sc !== 'none') {
      matches.push({ kind: 'subject', rank: SUBJECT_MODEL_RANK, isExact: sc === 'exact', isPartial: sc === 'partial', subjectId: sub.id, matchedName: sub.name });
    }
  }

  if (matches.length === 0) return { type: 'unresolved', phrase };

  // Exact > contains > partial; within a tier the more specific constraint wins.
  matches.sort((a, b) => {
    const scoreA = a.isExact ? 2 : a.isPartial ? 0 : 1;
    const scoreB = b.isExact ? 2 : b.isPartial ? 0 : 1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return b.rank - a.rank;
  });

  const best = matches[0];
  console.log(JSON.stringify({ event: 'subject_resolved', phrase, kind: best.kind, matchedName: best.matchedName, isExact: best.isExact, isPartial: best.isPartial, totalMatches: matches.length }));
  return {
    type: 'resolved',
    kind: best.kind,
    subjectId: best.subjectId,
    chapterId: best.chapterId,
    conceptId: best.conceptId,
    matchedName: best.matchedName,
    phrase,
    // Pass all ranked candidates so findConstrainedQuestion can try them in
    // order and skip any that have no available questions.
    allMatches: matches.map((m) => ({
      kind: m.kind,
      subjectId: m.subjectId,
      chapterId: m.chapterId,
      conceptId: m.conceptId,
      matchedName: m.matchedName,
    })),
  };
}

/**
 * Verifies a fetched question actually belongs to the resolved constraint.
 * The constrained fetch already filters by it, but this is defence in depth so
 * an unrelated subject can never be silently substituted.
 */
export function questionMatchesResolved(
  q: { conceptId: number | null; chapterId: string; chapter?: { subject?: { id: string } | null } | null },
  resolved: ResolvedSubject,
): boolean {
  if (resolved.kind === 'concept') return resolved.conceptId != null && q.conceptId === resolved.conceptId;
  if (resolved.kind === 'chapter') return q.chapterId === resolved.chapterId;
  if (resolved.kind === 'subject') return q.chapter?.subject?.id === resolved.subjectId;
  return false;
}

/**
 * Fetches a verified question-bank question constrained to the resolved
 * subject/topic. Tries all ranked matches in order, falling through to the
 * next match if the best one has no available questions (e.g. a taxonomy node
 * that exists in the tree but has no questions yet).
 */
export async function findConstrainedQuestion(opts: {
  resolved: ResolvedSubject;
  excludedIds: string[];
  selectedExamIds: string[];
}) {
  const examFilter = opts.selectedExamIds.length
    ? { chapter: { subject: { examId: { in: opts.selectedExamIds } } } }
    : {};

  // Build the candidate list: best match first, then the other ranked matches.
  const candidateConstraints = [
    opts.resolved,
    ...(opts.resolved.allMatches?.slice(1) || []),
  ];

  for (const match of candidateConstraints) {
    const subjectWhere: Record<string, unknown> =
      match.kind === 'concept'
        ? { conceptId: match.conceptId! }
        : match.kind === 'chapter'
          ? { chapterId: match.chapterId! }
          : { chapter: { subjectId: match.subjectId! } };

    const base = {
      isActive: true,
      ...subjectWhere,
      ...examFilter,
      ...(opts.excludedIds.length ? { id: { notIn: opts.excludedIds } } : {}),
    };

    const candidates = await prisma.question.findMany({
      where: base,
      include: { chapter: { include: { subject: true } }, concept: true },
      take: 30,
      orderBy: [{ updatedAt: 'desc' }],
    });

    const valid = candidates
      .filter((c) => validatePracticeQuestion({ text: c.text, options: c.options, correctOption: c.correctOption }).valid);

    if (valid.length > 0) {
      console.log(JSON.stringify({ event: 'constrained_q_found', matchedName: match.matchedName, kind: match.kind, questionId: valid[0].id }));
      return valid[0];
    }
  }

  return null;
}
