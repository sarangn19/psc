// Shared import helpers for PSC question importers.
// Extracted from importCorpus.mjs so multiple importers stay consistent.

import { PrismaClient } from '@prisma/client';

// ── CSV parser (RFC4180-ish) ──
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ── chapter detection: map question text -> one of the app's 43 chapter themes ──
export const CHAPTER_KEYWORDS = {
  'Indian Constitution': ['constitution', 'fundamental right', 'directive principle', 'union executive', 'parliament', 'supreme court', 'high court', 'governor', 'chief minister', 'lok sabha', 'rajya sabha', 'president of india', 'prime minister', 'amendment', 'election commission', 'finance commission', 'panchayat', 'municipality', '73rd', '74th', 'emergency', 'writ', 'citizenship', 'schedule', 'cabinet'],
  'Kerala History': ['kerala history', 'ancient kerala', 'chera', 'chola', 'pandya', 'zamorin', 'travancore', 'cochin', 'malabar', 'british kerala', 'kerala formation', 'sangam', 'venad', 'kochi kingdom', 'marthanda varma', 'sree moolam', 'kerala renaissance', 'renaissance', 'sree narayana', 'sndp', 'nss', 'vaikom', 'temple entry', 'ayyankali', 'chattampi', 'sahodaran', 'brahmananda', 'vagbhadananda', 'guruvayur', 'social reform'],
  'Indian History': ['indian history', 'mughal', 'delhi sultan', 'gupta', 'maurya', 'indus valley', 'freedom struggle', 'independence', 'gandhi', 'national movement', 'british india', 'revolt of 1857', 'non cooperation', 'civil disobedience', 'quit india', 'akbar', 'ashoka'],
  'Indian Geography': ['indian geography', 'himachal', 'indian river', 'ganga', 'brahmaputra', 'thar desert', 'indian climate', 'indian soil', 'indian plateau', 'deccan', 'indo gangetic', 'indian ocean', 'latitudes of india', 'indian states', 'indian district'],
  'Geography of Kerala': ['geography of kerala', 'kerala river', 'kerala district', 'western ghats', 'kerala backwater', 'kerala climate', 'kerala soil', 'kerala lake', 'kerala mountain', 'kerala biodiversity', 'kerala forest'],
  'Economy': ['economy', 'gdp', 'inflation', 'rbi', 'reserve bank', 'budget', 'taxation', 'gst', 'fiscal', 'monetary', 'banking', 'share market', 'sensex', 'nifty', 'export', 'import', 'employment', 'poverty', 'economic'],
  'Environment & Ecology': ['environment', 'ecology', 'biodiversity', 'wildlife', 'forest', 'pollution', 'climate change', 'global warming', 'endangered', 'national park', 'wildlife sanctuary', 'biosphere', 'wetland', 'ramsar', 'carbon', 'ecosystem'],
  'Science & Technology': ['science & technology', 'isro', 'satellite', 'space', 'robot', 'artificial intelligence', 'nuclear', 'computer', 'internet', 'technology', 'drdo', 'scientist', 'scientific', 'research'],
  'Biology Basics': ['biology', 'human body', 'cell', 'dna', 'virus', 'bacteria', 'vitamin', 'disease', 'blood', 'heart', 'kidney', 'liver', 'plant ', 'animal', 'health', 'medicine', 'organ', 'enzyme'],
  'Chemistry Basics': ['chemistry', 'chemical reaction', 'acid', 'base', 'salt', 'organic chemistry', 'periodic', 'molecule', 'atom', 'compound', 'element'],
  'Physics Basics': ['physics', 'motion', 'force', 'energy', 'light ', 'sound', 'electricity', 'magnetism', 'gravity', 'thermodynamics', 'optics', 'wave', 'velocity'],
  'Computer Basics': ['computer', 'internet', 'software', 'hardware', 'algorithm', 'programming', 'database', 'network', 'cyber', 'operating system', 'ms office', 'keyboard', 'binary', 'computer'],
  'Government Schemes': ['government scheme', 'scheme', 'yojana', 'pradhan mantri', 'mission', 'abhiyan', 'welfare', 'jan dhan', 'ayushman'],
  'Sports & Awards': ['sports', 'award', 'olympic', 'cricket', 'football', 'hockey', 'archery', 'medal', 'padma', 'bharat ratna', 'arjuna', 'dronacharya', 'khel ratna', 'asian games', 'commonwealth'],
  'Important Appointments': ['appointment', 'appointed', 'new chief', 'sworn in', 'takes charge', 'assumed charge', 'elected as', 'became the', 'new governor', 'new chief minister', 'new president', 'new ceo', 'new chairman'],
  'Monthly Current Affairs': ['current affair', 'recent', 'latest', 'this year', 'newly', 'launched', 'inaugurated', 'held on', 'announced', 'summit', 'conference 202', 'awarded'],
  'Kerala State News': ['kerala', 'kerala government', 'kerala state', 'kerala cm', 'kerela', 'kerala police'],
  'National News': ['indian government', 'central government', 'union minister', 'national ', 'india announced', 'india launched'],
  'International News': ['united nations', 'world ', 'global', 'international', 'foreign', 'treaty', 'bilateral', 'country', 'summit'],
  'Malayalam Grammar': ['malayalam grammar', 'sandhi', 'samasa', 'padashuddhi', 'vakyashuddhi', 'padyam', 'gadyam', 'vyakaranam', 'sahithyam', 'proverbs', 'idiom', 'malayalam'],
  'Comprehension': ['comprehension', 'passage', 'read the following', 'according to the passage', 'given passage'],
  'Synonyms & Antonyms': ['synonym', 'antonym', 'opposite meaning', 'similar meaning', 'proverb'],
  'Vocabulary': ['vocabulary', 'meaning of the word', 'translation', 'choose the correct'],
  'Grammar Basics': ['grammar', 'tense', 'preposition', 'article', 'voice', 'narration', 'active passive', 'degrees of comparison'],
  'Algebra': ['algebra', 'equation', 'polynomial', 'linear equation', 'quadratic', 'factor'],
  'Number System': ['number system', 'digit', 'prime number', 'odd number', 'even number', 'divisibility', 'lcm', 'hcf'],
  'Percentages': ['percentage', 'percent', 'profit and loss', 'discount'],
  'Profit & Loss': ['profit', 'loss', 'discount', 'cost price', 'selling price', 'markup'],
  'Simple & Compound Interest': ['compound interest', 'simple interest', 'principal', 'interest'],
  'Mensuration': ['mensuration', 'surface area', 'perimeter', 'cylinder', 'sphere', 'cone', 'cube', 'cuboid', 'volume of'],
  'Time & Distance': ['time and distance', 'average speed', 'relative speed', 'train'],
  'Time & Work': ['time and work', 'efficiency', 'pipe', 'cistern', 'a can do'],
  'Mental Ability': ['mental ability', 'coding decoding', 'blood relation', 'direction sense', 'series completion', 'syllogism', 'venn diagram', 'analogy', 'classification', 'seating arrangement', 'odd one out', 'reasoning'],
  'Tenses': ['tense', 'present tense', 'past tense', 'future tense', 'perfect', 'continuous', 'will', 'shall', 'had gone', 'has been'],
  'Articles & Prepositions': ['article', 'preposition', 'a an the', 'in on at', 'by between among', 'before a noun', 'fill in the blank with'],
  'Sahithyam': ['sahithyam', 'malayalam literature', 'kavitha', 'sahithya'],
  'Vyakaranam': ['vyakaranam', 'malayalam grammar rule', 'padashuddhi', 'vakyashuddhi'],
  'Padyam': ['padyam', 'malayalam poem', 'verse', 'slokam'],
  'Gadyam': ['gadyam', 'malayalam prose', 'gadya'],
  'Proverbs': ['proverb', 'pazhamchollu', 'malayalam proverb', 'idiom'],
  'Human Body': ['human body', 'human system', 'digestive system', 'respiratory system', 'circulatory system', 'nervous system', 'skeletal system', 'endocrine', 'muscular', 'human organ'],
};

export function detectChapter(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  for (const [chapter, kws] of Object.entries(CHAPTER_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) return chapter;
  }
  return null;
}

// ── option recovery (split embedded labels like "B) ...") ──
export function recoverOptions(opts) {
  const out = [...opts];
  const emptyIdx = out.map((o, i) => (o.trim() ? -1 : i)).filter((i) => i >= 0);
  if (emptyIdx.length === 0) return out;
  const nonEmpty = out.map((o, i) => (o.trim() ? i : -1)).filter((i) => i >= 0);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const ei of emptyIdx) {
    const label = `${String.fromCharCode(65 + ei)})`;
    for (const ni of nonEmpty) {
      if (out[ni].includes(label)) {
        const parts = out[ni].split(new RegExp(`\\s*${esc(label)}\\s*`));
        if (parts.length > 1) {
          out[ni] = parts[0].trim();
          let remaining = parts.slice(1).join(label).trim();
          for (const lei of emptyIdx.filter((x) => x > ei)) {
            const llabel = `${String.fromCharCode(65 + lei)})`;
            const lp = remaining.split(new RegExp(`\\s*${esc(llabel)}\\s*`), 2);
            if (lp.length > 1) {
              out[lei] = lp[0].trim();
              remaining = lp[1].trim();
            }
          }
          out[ei] = remaining;
        }
        break;
      }
    }
  }
  return out;
}

export const LETTER_TO_IDX = { A: 0, B: 1, C: 2, D: 3 };

// Corrupted text comes in two flavors from bad re-encodings of non-ASCII
// (e.g. Malayalam) source text:
//   - Private Use Area code points (U+E000–U+F8FF)
//   - Latin-1 mojibake (U+0080–U+00FF), e.g. ¾ Þ ÿ, from a UTF-8→cp1252→UTF-8 round trip
//   - the replacement char U+FFFD
// Clean text is ASCII or proper Malayalam (U+0D00–U+0D7F), never in those ranges.
export function isBad(s) {
  for (const ch of (s || '')) {
    const c = ch.codePointAt(0);
    if ((c >= 0xe000 && c <= 0xf8ff) || c === 0xfffd || (c >= 0x80 && c <= 0xff)) return true;
  }
  return false;
}

export function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── chapter name -> lowest id ──
export async function loadChapterNameMap(prisma) {
  const chapters = await prisma.chapter.findMany({ select: { id: true, name: true } });
  const nameToIds = new Map();
  for (const c of chapters) {
    const key = c.name.toLowerCase();
    if (!nameToIds.has(key)) nameToIds.set(key, []);
    nameToIds.get(key).push(c.id);
  }
  return (name) => {
    const ids = nameToIds.get(name.toLowerCase());
    return ids ? ids.sort()[0] : null;
  };
}

export async function ensureUncategorizedChapter(prisma) {
  const chapterByName = await loadChapterNameMap(prisma);
  let id = chapterByName('Imported Corpus');
  if (!id) {
    const exam = await prisma.exam.upsert({
      where: { name: 'Imported PSC Corpus' },
      update: {},
      create: { name: 'Imported PSC Corpus', description: 'Auto-imported from scraped corpus', category: 'general' },
    });
    const subject = await prisma.subject.upsert({
      where: { name_examId: { name: 'Imported PSC Corpus', examId: exam.id } },
      update: {},
      create: { name: 'Imported PSC Corpus', examId: exam.id },
    });
    const chap = await prisma.chapter.create({
      data: { name: 'Imported Corpus', subjectId: subject.id },
    });
    id = chap.id;
  }
  return id;
}

// ── concept finder over taxonomy nodes ──
export function makeConceptFinder(nodes) {
  const nodeIndex = nodes.map((n) => ({
    id: n.id,
    name: (n.nameEnglish || '').toLowerCase(),
    aliases: (n.aliases || []).map((a) => String(a).toLowerCase()),
  }));
  return function findConcept(term) {
    if (!term) return null;
    const norm = (s) => (s || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\bindian\b/g, 'india')
      .split(/\s+/)
      .filter((w) => w && !['of', 'the', 'and', 'a', 'an', 'for', 'in', 'on'].includes(w));
    const want = norm(term);
    if (want.length === 0) return null;
    const t = term.toLowerCase();
    let hit = nodeIndex.find((n) => n.name === t);
    if (hit) return hit.id;
    let best = null;
    let bestScore = 0;
    for (const n of nodeIndex) {
      const blob = n.name + ' ' + n.aliases.join(' ');
      const have = norm(blob);
      let score = 0;
      for (const w of want) if (have.includes(w)) score++;
      if (score > bestScore || (score === bestScore && score > 0 && best && n.name.length < best.name.length)) {
        bestScore = score;
        best = n;
      }
    }
    return bestScore >= Math.min(2, want.length) ? best.id : null;
  };
}

// Load existing question normalized texts for cross-source dedup.
export async function loadExistingNormalizedTexts(prisma) {
  const all = await prisma.question.findMany({ select: { text: true } });
  return new Set(all.map((q) => normalizeText(q.text)).filter(Boolean));
}

// Idempotent clear of a source tag. Questions may be referenced by
// adaptive_items / question_attempts / question_reports (FK RESTRICT),
// so delete those dependents first.
export async function clearTag(prisma, tag) {
  const ids = (await prisma.question.findMany({
    where: { tags: { has: tag } },
    select: { id: true },
  })).map((q) => q.id);
  if (ids.length === 0) return 0;
  await prisma.adaptiveItem.deleteMany({ where: { questionId: { in: ids } } });
  await prisma.questionAttempt.deleteMany({ where: { questionId: { in: ids } } });
  await prisma.questionReport.deleteMany({ where: { questionId: { in: ids } } });
  await prisma.question.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}
