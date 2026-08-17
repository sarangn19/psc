// Seed taxonomy nodes with Q&A facts extracted from all_questions_answers.pdf.
// Matches each fact's answer (and question entities) to a node by
// Malayalam/English name or alias, with a subject-level fallback.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
const prisma = new PrismaClient();

const FACTS = 'C:/Users/saran/AppData/Local/Temp/opencode/facts.json';
const MAX_FACTS = 80;

function norm(s) {
  return (s || '').toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// chapter detection (reuse from corpus import)
const CHAPTER_KEYWORDS = {
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
};
function detectChapter(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  for (const [chapter, kws] of Object.entries(CHAPTER_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) return chapter;
  }
  return null;
}

async function main() {
  const facts = JSON.parse(fs.readFileSync(FACTS, 'utf8'));
  const nodes = await prisma.taxonomyNode.findMany({
    select: { id: true, nameEnglish: true, nameMalayalam: true, aliases: true, metadata: true },
  });

  // build indexes
  // idempotency: clear previously seeded facts
  const withFacts = nodes.filter((n) => n.metadata && Array.isArray(n.metadata.facts) && n.metadata.facts.length);
  for (const n of withFacts) {
    const m = { ...(n.metadata || {}) };
    m.facts = [];
    await prisma.taxonomyNode.update({ where: { id: n.id }, data: { metadata: m } });
  }

  const exactMal = new Map(); // norm name/alias -> [ids]
  const nameList = []; // {id, n} normalized names for substring
  for (const n of nodes) {
    const names = [n.nameEnglish, n.nameMalayalam, ...(n.aliases || [])].filter(Boolean).map(norm);
    for (const nm of names) {
      if (!nm) continue;
      if (!exactMal.has(nm)) exactMal.set(nm, []);
      exactMal.get(nm).push(n.id);
      nameList.push({ id: n.id, n: nm });
    }
  }

  // facts per node
  const byNode = new Map(); // nodeId -> [{q,a,category}]
  const addFact = (id, f) => {
    if (!byNode.has(id)) byNode.set(id, []);
    byNode.get(id).push(f);
  };

  let specific = 0, fallback = 0, unmatched = 0;

  for (const f of facts) {
    const na = norm(f.a);
    const nq = norm(f.q);
    let best = null, bestScore = 0;
    // 1) exact match on answer tokens (the answer is usually the entity)
    const answerTokens = na.split(' ').filter((w) => w.length >= 3);
    for (const tok of answerTokens) {
      const ids = exactMal.get(tok);
      if (ids) for (const id of ids) { if (3 > bestScore) { best = id; bestScore = 3; } }
    }
    // 2) substring (answer mentions node name => high precision)
    if (bestScore < 2 && na.length >= 3) {
      for (const { id, n } of nameList) {
        if (n.length >= 3 && na.includes(n)) {
          best = id; bestScore = 2; break;
        }
      }
    }
    // 3) weak: node name contains answer (only for longer, specific answers)
    if (bestScore < 1 && na.length >= 4) {
      let bestLen = 1e9;
      for (const { id, n } of nameList) {
        if (n.length >= 4 && n.includes(na) && n.length < bestLen) {
          best = id; bestScore = 1; bestLen = n.length;
        }
      }
    }
    if (best && bestScore >= 1) {
      addFact(best, f); specific++;
      continue;
    }
    // 3) subject fallback
    const chap = detectChapter(f.q + ' ' + f.a);
    if (chap) {
      // find a node whose name matches the chapter (subject-level)
      const cn = norm(chap);
      const ids = exactMal.get(cn) || exactMal.get(norm(chap.replace(/ & /g, ' and ')));
      if (ids && ids[0]) { addFact(ids[0], f); fallback++; continue; }
    }
    unmatched++;
  }

  // merge into metadata.facts, dedupe, cap
  let updated = 0;
  for (const [id, flist] of byNode) {
    const node = nodes.find((n) => n.id === id);
    const meta = (node && node.metadata && typeof node.metadata === 'object') ? { ...node.metadata } : {};
    const existing = Array.isArray(meta.facts) ? meta.facts : [];
    const seenQ = new Set(existing.map((e) => e.q));
    for (const f of flist) {
      if (seenQ.has(f.q)) continue;
      existing.push({ q: f.q, a: f.a, category: f.category });
      seenQ.add(f.q);
    }
    // cap
    meta.facts = existing.slice(0, MAX_FACTS);
    await prisma.taxonomyNode.update({ where: { id }, data: { metadata: meta } });
    updated++;
  }

  console.log(JSON.stringify({
    total_facts: facts.length,
    matched_specific_node: specific,
    matched_subject_fallback: fallback,
    unmatched: unmatched,
    nodes_updated: updated,
  }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
