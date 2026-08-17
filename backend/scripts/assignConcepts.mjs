// Accurate taxonomy (conceptId) assignment for all questions.
// Strategy: score each question against all taxonomy nodes using the node's
// nameEnglish + nameMalayalam tokens (longer tokens weighted higher, plus an
// exact-phrase bonus). Pick the best-matching node; if no confident match,
// fall back to the node's SUBJECT (top of its subtree). Existing conceptIds
// are kept when the new method is not confident (no regression).
// Run: node scripts/assignConcepts.mjs [dry]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { detectChapter } from './lib/pscMapping.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
for (const l of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const DRY = process.argv.includes('dry');
const prisma = new PrismaClient();

// Map the 43 chapter themes -> the 23 taxonomy SUBJECT node ids.
// Used as the primary (curated, accurate) subject signal; lexical aggregation
// is the fallback when the chapter subtree shows no real topic overlap.
const THEME_SUBJECT = {
  'Indian Constitution': 614,
  'Kerala History': 48,
  'Indian History': 48,
  'Indian Geography': 87,
  'Geography of Kerala': 87,
  'Economy': 152,
  'Environment & Ecology': 469,
  'Science & Technology': 295,
  'Biology Basics': 295,
  'Chemistry Basics': 295,
  'Physics Basics': 295,
  'Computer Basics': 426,
  'Government Schemes': 563,
  'Sports & Awards': 591,
  'Important Appointments': 563,
  'Monthly Current Affairs': 20,
  'Kerala State News': 20,
  'National News': 20,
  'International News': 20,
  'Malayalam Grammar': 383,
  'Comprehension': 404,
  'Synonyms & Antonyms': 404,
  'Vocabulary': 404,
  'Grammar Basics': 404,
  'Algebra': 475,
  'Number System': 475,
  'Percentages': 355,
  'Profit & Loss': 355,
  'Simple & Compound Interest': 355,
  'Mensuration': 355,
  'Time & Distance': 355,
  'Time & Work': 355,
  'Mental Ability': 302,
};

const STOP = new Set(['the','a','an','of','in','on','at','to','for','and','or','is','are','was','were','be','been','being','which','what','who','whom','when','where','why','how','this','that','these','those','with','from','by','as','it','its','their','they','we','you','he','she','not','no','can','will','would','should','may','might','must','do','does','did','has','have','had','into','about','than','then','such','only','also','any','all','each','every','more','most','other','some','out','up','down','between','among','during','before','after','under','over','both','either','neither','there','here','if','so','because','but','while','through','against','per','via','etc','eg','ie','following','except','including','one','two','three','first','last','new','old','best','worst','good','bad','same','different','example','options','option','answer','answers','question','questions','india','indian','kerala','keralam','state','country','national','government','public','service','commission','general','knowledge','year','years','number','name','names','act','acts']);

function tokenize(s) {
  if (!s) return [];
  const toks = s.toLowerCase().split(/[^a-z0-9ഀ-ൿ]+/);
  const out = [];
  for (const t of toks) {
    if (t.length < 2) continue;
    if (STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

function weight(t) { return Math.min(t.length, 8); }

async function main() {
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, nameMalayalam: true, parentId: true, level: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Build children map + walk up to find SUBJECT ancestor
  const childrenMap = new Map();
  for (const n of nodes) { if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []); childrenMap.get(n.parentId).push(n.id); }
  function subjectOf(id) {
    let cur = id;
    const seen = new Set();
    while (cur != null && !seen.has(cur)) {
      seen.add(cur);
      const n = nodeById.get(cur);
      if (!n) break;
      if (n.level === 'SUBJECT') return cur;
      cur = n.parentId;
    }
    return null;
  }

  // Precompute per-node scoring tokens + subjectId
  const scored = nodes
    .filter((n) => n.level !== 'EXAM')
    .map((n) => {
      const ne = (n.nameEnglish || '');
      const nm = (n.nameMalayalam || '');
      const toks = new Set([...tokenize(ne), ...tokenize(nm)]);
      return { id: n.id, ne: ne.toLowerCase(), toks, subjectId: subjectOf(n.id), level: n.level, name: ne || nm };
    });

  const questions = await prisma.question.findMany({ select: { id: true, text: true, options: true, explanation: true, conceptId: true } });
  console.log('questions', questions.length, '| nodes scored', scored.length, DRY ? '(DRY RUN)' : '');

  const SPEC_THRESH = 12; // assign a specific node only when confidently matched
  let assigned = 0, kept = 0, fallbackSubject = 0, unchanged = 0;
  const perSubject = {};
  const updates = {}; // conceptId -> [questionIds]
  const samples = [];
  const seenSamples = new Set();

  for (const q of questions) {
    const opts = Array.isArray(q.options) ? q.options.join(' ') : '';
    const blob = `${q.text} ${opts} ${q.explanation || ''}`;
    const qTokens = new Set(tokenize(blob));
    const blobLower = blob.toLowerCase();

    // subjectId -> array of {id, score}
    const bySubj = new Map();
    const pushSubj = (sid, id, sc) => {
      const key = sid == null ? 2 : sid;
      if (!bySubj.has(key)) bySubj.set(key, []);
      bySubj.get(key).push({ id, sc });
    };

    if (qTokens.size > 0) {
      for (const n of scored) {
        let sc = 0;
        for (const t of n.toks) if (qTokens.has(t)) sc += weight(t);
        if (n.ne && blobLower.includes(n.ne) && n.ne.length > 3) sc += 15; // exact phrase bonus
        if (sc <= 0) continue;
        pushSubj(n.subjectId, n.id, sc);
      }
    }

    const bestInSubject = (sid) => {
      const arr = bySubj.get(sid) || [];
      if (!arr.length) return { id: sid, sc: 0 };
      arr.sort((a, b) => b.sc - a.sc);
      return { id: arr[0].id, sc: arr[0].sc };
    };
    const subjAgg = (sid) => {
      const arr = bySubj.get(sid);
      if (!arr) return 0;
      return arr.map((x) => x.sc).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
    };

    if (bySubj.size === 0) {
      if (q.conceptId == null) { (updates[2] = updates[2] || []).push(q.id); fallbackSubject++; }
      else kept++;
      continue;
    }

    // Primary subject = detected chapter theme; fall back to lexical aggregate
    // when the chapter's subtree shows no real topical overlap.
    const theme = detectChapter(`${q.text} ${opts}`);
    let subject = 2;
    if (theme && THEME_SUBJECT[theme]) {
      subject = (bestInSubject(THEME_SUBJECT[theme]).sc >= 4) ? THEME_SUBJECT[theme] : null;
    }
    if (subject == null || !THEME_SUBJECT[theme]) {
      let bestAgg = -1;
      for (const [sid] of bySubj) { const a = subjAgg(sid); if (a > bestAgg) { bestAgg = a; subject = sid; } }
    }

    const bi = bestInSubject(subject);
    let target;
    if (bi.sc >= SPEC_THRESH) {
      target = bi.id; // confident specific node, confined to the chosen subject
    } else {
      target = subject; // subject-level fallback (accurate at subject level)
      fallbackSubject++;
    }

    if (q.conceptId != null) {
      if (q.conceptId === target) { unchanged++; continue; }
      if (bi.sc < SPEC_THRESH) { kept++; continue; } // don't downgrade existing
      (updates[target] = updates[target] || []).push(q.id);
      assigned++;
    } else {
      (updates[target] = updates[target] || []).push(q.id);
      assigned++;
    }

    if (samples.length < 40 && !seenSamples.has(q.text)) {
      seenSamples.add(q.text);
      const subjName = nodeById.get(subject)?.nameEnglish || '?';
      samples.push({ q: q.text.slice(0, 75), cur: q.conceptId, tgt: target, score: bi.sc, subj: subjName, fb: bi.sc < SPEC_THRESH });
    }
  }

  if (DRY) {
    console.log('\nSAMPLE ASSIGNMENTS (question | cur->new | score | subject | fallback?):');
    for (const s of samples) console.log(`  Q: ${s.q}  => ${s.cur}->${s.tgt} score=${s.score} subj=${s.subj} ${s.fb ? '[SUBJECT FALLBACK]' : ''}`);
    console.log(`\nDRY counts: would-assign=${assigned} keep-existing=${kept} subject-fallback=${fallbackSubject} unchanged=${unchanged}`);
    await prisma.$disconnect();
    return;
  }

  // Apply updates grouped by target conceptId
  let updated = 0;
  for (const [cid, ids] of Object.entries(updates)) {
    await prisma.question.updateMany({ where: { id: { in: ids } }, data: { conceptId: Number(cid) } });
    updated += ids.length;
    const subj = nodeById.get(Number(cid));
    const key = subj ? subj.nameEnglish : cid;
    perSubject[key] = (perSubject[key] || 0) + ids.length;
  }
  const finalNull = await prisma.question.count({ where: { conceptId: null } });
  const finalWith = await prisma.question.count({ where: { conceptId: { not: null } } });
  console.log(JSON.stringify({ updated, kept_existing: kept, subject_fallback: fallbackSubject, unchanged, final_null: finalNull, final_with_concept: finalWith, per_subject: perSubject }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
