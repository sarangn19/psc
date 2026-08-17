// Concept refinement (#4): improve accuracy for questions currently parked at
// a SUBJECT-level conceptId. For each such question we score its text+options+
// explanation against ALL specific taxonomy nodes (DOMAIN/TOPIC/CONCEPT) and:
//   - reassign to a specific node when that node scores HIGH (strong evidence,
//     even if it belongs to a different subject -> also fixes wrong-subject cases);
//   - deepen within the *current* subject when a same-subject specific node
//     scores at least MID (safe, no subject change);
//   - otherwise keep the current SUBJECT assignment (no regression).
// Questions already at a specific node are left untouched.
// Run: node scripts/refineConcepts.mjs [dry]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
for (const l of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const DRY = process.argv.includes('dry');
const prisma = new PrismaClient();

const HIGH = 12; // strong token score required for a non-phrase reassignment

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
const weight = (t) => Math.min(t.length, 8);

async function main() {
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, nameMalayalam: true, aliases: true, parentId: true, level: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const subjectIds = new Set(nodes.filter((n) => n.level === 'SUBJECT').map((n) => n.id));

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

  const scored = nodes
    .filter((n) => n.level !== 'EXAM')
    .map((n) => {
      const ne = (n.nameEnglish || '');
      const nm = (n.nameMalayalam || '');
      const als = (n.aliases || []).map((a) => String(a).toLowerCase());
      const toks = new Set([...tokenize(ne), ...tokenize(nm), ...als.flatMap((a) => tokenize(a))]);
      const words = ne.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
      const multiword = words.length >= 2 && ne.length >= 6;
      const aliasPhrases = als.filter((a) => a.length >= 4); // strong single-token phrase signals
      return { id: n.id, ne: ne.toLowerCase(), toks, multiword, aliasPhrases, subjectId: subjectOf(n.id), level: n.level };
    });

  const questions = await prisma.question.findMany({ select: { id: true, text: true, options: true, explanation: true, conceptId: true } });
  const subjectQs = questions.filter((q) => q.conceptId != null && subjectIds.has(q.conceptId));
  console.log('total questions', questions.length, '| at SUBJECT level', subjectQs.length, DRY ? '(DRY RUN)' : '');

  let deepened = 0, subjectSwitched = 0, unchanged = 0;
  const updates = {};
  const samples = [];
  const seenSamples = new Set();

  for (const q of subjectQs) {
    const opts = Array.isArray(q.options) ? q.options.join(' ') : '';
    const blob = `${q.text} ${opts} ${q.explanation || ''}`;
    const qTokens = new Set(tokenize(blob));
    const blobLower = blob.toLowerCase();

    let bestSpec = null; // {id, sc, matched, phrase, subjectId}
    if (qTokens.size > 0) {
      for (const n of scored) {
        if (n.level === 'SUBJECT') continue;
        let sc = 0;
        let matched = 0;
        for (const t of n.toks) if (qTokens.has(t)) { sc += weight(t); matched++; }
        const phrase = n.multiword && blobLower.includes(n.ne);
        let aliasHits = 0;
        for (const a of n.aliasPhrases) if (blobLower.includes(a)) { sc += 8; aliasHits++; }
        if (phrase) sc += 12; // exact-phrase bonus
        if (sc <= 0) continue;
        if (!bestSpec || sc > bestSpec.sc) bestSpec = { id: n.id, sc, matched, phrase, aliasHits, subjectId: n.subjectId };
      }
    }

    const currentSubject = subjectOf(q.conceptId);
    let target = q.conceptId;
    let switched = false;

    // Only reassign on STRONG evidence to avoid degrading accuracy:
    //   - the node's full multiword name literally appears in the question, OR
    //   - >=2 distinct tokens match AND the weighted score reaches HIGH.
    // Reassign only on strong evidence: an exact multiword phrase match, OR the
    // question sharing >=2 distinct tokens (name or distinctive alias) with the
    // node while the weighted score reaches HIGH. Requiring 2+ overlaps blocks
    // single-coincidence false switches (e.g. "malayalam" -> Malayali Memorial,
    // "series" -> Series) while keeping genuine multi-token hits.
    const confident = bestSpec && (bestSpec.phrase || (bestSpec.matched >= 2 && bestSpec.sc >= HIGH));
    if (confident) {
      target = bestSpec.id;
      if (bestSpec.subjectId !== currentSubject) switched = true;
    }

    if (target === q.conceptId) { unchanged++; }
    else {
      (updates[target] = updates[target] || []).push(q.id);
      if (switched) subjectSwitched++; else deepened++;
      if (samples.length < 50 && !seenSamples.has(q.text)) {
        seenSamples.add(q.text);
        const curName = nodeById.get(q.conceptId)?.nameEnglish || '?';
        const tgtName = nodeById.get(target)?.nameEnglish || '?';
        samples.push({ q: q.text.slice(0, 70), cur: curName, tgt: tgtName, score: bestSpec.sc, matched: bestSpec.matched, phrase: bestSpec.phrase, switched });
      }
    }
  }

  if (DRY) {
    console.log('\nSAMPLE REFINEMENTS (question | SUBJECT->specific | score | switched?):');
    for (const s of samples) console.log(`  Q: ${s.q}  => ${s.cur} -> ${s.tgt} score=${s.score} match=${s.matched} phrase=${s.phrase} ${s.switched ? '[SUBJECT SWITCH]' : ''}`);
    console.log(`\nDRY counts: would-reassign=${deepened + subjectSwitched} (deepen=${deepened} subject-switch=${subjectSwitched}) unchanged=${unchanged}`);
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const [cid, ids] of Object.entries(updates)) {
    await prisma.question.updateMany({ where: { id: { in: ids } }, data: { conceptId: Number(cid) } });
    updated += ids.length;
  }
  const finalSubject = await prisma.question.count({ where: { conceptId: { in: [...subjectIds] } } });
  const finalWith = await prisma.question.count({ where: { conceptId: { not: null } } });
  console.log(JSON.stringify({ updated, deepened, subjectSwitched, unchanged, remaining_subject_level: finalSubject, now_specific: finalWith - finalSubject }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
