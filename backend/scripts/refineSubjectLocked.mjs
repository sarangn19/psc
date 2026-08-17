// #4e: SUBJECT-LOCKED semantic refinement (stage 2 only).
// Each SUBJECT-level question keeps its current subject node as the lock; an LLM
// picks the best specific node (DOMAIN/TOPIC) from THAT subject's subtree. Any
// proposed id outside the subject's list is rejected -> falls back to the subject
// node, so cross-subject contamination is impossible by construction.
//
// DRY BY DEFAULT: writes one line per decision to scripts/_locked_proposals.jsonl
// and makes no DB changes. Existing proposals are skipped (resume-safe). Audit the
// file + summary, then run with `apply`. Optional: apply --only=ID[,ID...] or
// apply --except=ID[,ID...] to restrict which subjects get applied.
// Run: node scripts/refineSubjectLocked.mjs [limit=N] [model=gemini-flash-latest]
//      node scripts/refineSubjectLocked.mjs apply [--only=614,48] [--except=2]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2];
}
const argv = process.argv.slice(2);
const APPLY = argv.includes('apply');
const LIMIT = Number((argv.find((a) => a.startsWith('limit=')) || 'limit=1e9').split('=')[1]);
const MODEL = argv.find((a) => a.startsWith('model='))?.split('=')[1] || 'gemini-flash-latest';
let ONLY = null, EXCEPT = new Set();
for (const a of argv) {
  const k = a.replace(/^--?/, '').split('=')[0];
  const v = a.includes('=') ? a.split('=').slice(1).join('=') : '';
  if (k === 'only') ONLY = new Set(v.split(',').map(Number));
  if (k === 'except') EXCEPT = new Set(v.split(',').map(Number));
}
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1';
const IS_OR = OPENAI_BASE.includes('openrouter');
const API_KEY = IS_OR ? OR_KEY : OPENAI_KEY;
const USE_GEMINI = MODEL.startsWith('gemini') && !!GEMINI_KEY;
const USE_OPENAI = !USE_GEMINI && !!API_KEY;
if (!USE_GEMINI && !USE_OPENAI) { console.error('No API key (need GEMINI_API_KEY or OpenAI/OpenRouter).'); process.exit(1); }
const PROVIDER = USE_GEMINI ? 'Gemini' : (IS_OR ? 'OpenRouter' : 'Groq');
const BATCH = 50;
const PACE = 2500;
const CAP = 150; // candidate nodes per subject
const PROPOSALS = path.resolve(__dirname, '_locked_proposals.jsonl');
const prisma = new PrismaClient();

async function gemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 10000 } }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
async function openaiChat(prompt) {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 4096 }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content || '';
  if (!txt.trim()) throw new Error(`OpenAI empty completion`);
  return txt;
}
async function callLLM(prompt) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = USE_GEMINI ? await gemini(prompt) : await openaiChat(prompt);
      await new Promise((res) => setTimeout(res, PACE));
      return r;
    } catch (e) {
      lastErr = e;
      const is429 = String(e.message).includes('429');
      await new Promise((res) => setTimeout(res, is429 ? 30000 : 1200 * (attempt + 1)));
    }
  }
  throw lastErr;
}
function parseIds(reply, n) {
  const ids = [];
  const re = /(\d{2,6})/g;
  let m;
  while ((m = re.exec(reply)) !== null && ids.length < n) ids.push(+m[1]);
  while (ids.length < n) ids.push(null);
  return ids;
}
const qline = (q, k) => `${k + 1}. ${q.text}  Options: ${(Array.isArray(q.options) ? q.options : []).map((o, j) => String.fromCharCode(65 + j) + ')' + o).join(' ')}`;

async function main() {
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, parentId: true, level: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const subjectIds = new Set(nodes.filter((n) => n.level === 'SUBJECT').map((n) => n.id));
  const childrenMap = new Map();
  for (const n of nodes) { if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []); childrenMap.get(n.parentId).push(n.id); }
  function descendants(id) { const out = []; const stack = [id]; while (stack.length) { const c = stack.pop(); for (const ch of (childrenMap.get(c) || [])) { out.push(ch); stack.push(ch); } } return out; }

  const subjects = nodes.filter((n) => n.level === 'SUBJECT');
  const subjSpec = new Map();
  for (const s of subjects) {
    const spec = descendants(s.id).map((id) => nodeById.get(id)).filter((n) => n && (n.level === 'DOMAIN' || n.level === 'TOPIC'));
    spec.sort((a, b) => (a.level === 'TOPIC' ? 0 : 1) - (b.level === 'TOPIC' ? 0 : 1));
    subjSpec.set(s.id, spec.slice(0, CAP));
  }

  if (APPLY) {
    if (!fs.existsSync(PROPOSALS)) { console.error('No proposals file — run the dry pass first.'); process.exit(1); }
    const lines = fs.readFileSync(PROPOSALS, 'utf8').trim().split('\n').filter(Boolean);
    const props = new Map();
    for (const l of lines) { const p = JSON.parse(l); if (!props.has(p.qid)) props.set(p.qid, p); }
    let ids = [...props.values()];
    if (ONLY) ids = ids.filter((p) => ONLY.has(p.sid));
    if (EXCEPT.size) ids = ids.filter((p) => !EXCEPT.has(p.sid));
    const qids = ids.map((p) => p.qid);
    const still = await prisma.question.findMany({ where: { id: { in: qids }, conceptId: { in: [...subjectIds] } }, select: { id: true } });
    const stillSet = new Set(still.map((q) => q.id));
    const updates = {};
    let applied = 0, keptSubj = 0;
    for (const p of ids) {
      if (!stillSet.has(p.qid)) continue;
      if (p.chose === p.sid) { keptSubj++; continue; }
      (updates[p.chose] = updates[p.chose] || []).push(p.qid);
    }
    for (const [cid, qids2] of Object.entries(updates)) { await prisma.question.updateMany({ where: { id: { in: qids2 } }, data: { conceptId: Number(cid) } }); applied += qids2.length; }
    const finalSubj = await prisma.question.count({ where: { conceptId: { in: [...subjectIds] } } });
    const finalWith = await prisma.question.count({ where: { conceptId: { not: null } } });
    console.log(JSON.stringify({ applied, decided_keep_subject: keptSubj, skipped_no_longer_subject: qids.length - stillSet.size, remaining_subject_level: finalSubj, now_specific: finalWith - finalSubj }, null, 2));
    fs.unlinkSync(PROPOSALS);
    await prisma.$disconnect();
    return;
  }

  const questions = await prisma.question.findMany({ where: { isActive: true, conceptId: { in: [...subjectIds] } }, select: { id: true, text: true, options: true, conceptId: true } });
  let todo = questions
    .filter((q) => subjSpec.get(q.conceptId)?.length)
    .filter((q) => !EXCEPT.size || !EXCEPT.has(q.conceptId))
    .filter((q) => !ONLY || ONLY.has(q.conceptId));
  if (LIMIT < 1e9) todo = todo.slice(0, LIMIT);

  const skip = new Set();
  if (fs.existsSync(PROPOSALS)) {
    for (const l of fs.readFileSync(PROPOSALS, 'utf8').trim().split('\n').filter(Boolean)) { const p = JSON.parse(l); skip.add(p.qid); }
  }
  todo = todo.filter((q) => !skip.has(q.id));
  console.log('subject-level to refine', questions.length, '| with candidates', todo.length, '| already proposed (skip)', skip.size, '| model', MODEL, `(${PROVIDER})`, '| DRY');

  const groups = new Map();
  for (const q of todo) { (groups.get(q.conceptId) || groups.set(q.conceptId, []).get(q.conceptId)).push(q); }

  const stream = fs.createWriteStream(PROPOSALS, { flags: 'a' });
  let proposed = 0, kept = 0, rejected = 0, processed = 0;
  const samples = [];
  const perSubj = new Map(); // sid -> {assigned:Map(nodeId->count), kept}

  for (const [sid, qs] of groups) {
    const spec = subjSpec.get(sid);
    const subjName = nodeById.get(sid)?.nameEnglish || `id${sid}`;
    if (!perSubj.has(sid)) perSubj.set(sid, { assigned: new Map(), kept: 0, total: 0 });
    const st = perSubj.get(sid);
    for (let i = 0; i < qs.length; i += BATCH) {
      const batch = qs.slice(i, i + BATCH);
      const prompt = `You label Kerala PSC exam questions with a specific topic node. Subject is "${subjName}" — questions below all belong to this subject, stay inside it. For each question pick the single BEST matching topic from the list. Do NOT invent nodes. If no listed topic is a good fit, output ${sid} (the subject id) — it is better to stay at the subject level than to guess. Being conservative is expected; most questions where you are not clearly sure should output ${sid}.
Examples:
Q: "The speed of light in vacuum is" -> pick "Optics" if listed, else ${sid}
Q: "Who wrote Ramayana" -> ${sid} if no literature/author topic fits
Topic nodes (id = name):
${spec.map((n) => `${n.id} = ${n.nameEnglish}`).join('\n')}
Questions:
${batch.map(qline).join('\n')}
Output exactly ${batch.length} lines, each just one node id number, in order. Nothing else.`;
      let ids;
      try { ids = parseIds(await callLLM(prompt), batch.length); } catch { ids = batch.map(() => null); }
      batch.forEach((q, k) => {
        const nid = ids[k];
        const valid = nid != null && (nid === sid || spec.some((n) => n.id === nid));
        const chosen = valid ? nid : sid;
        if (!valid && nid != null) rejected++;
        if (chosen === sid) { kept++; st.kept++; } else { proposed++; st.assigned.set(chosen, (st.assigned.get(chosen) || 0) + 1); }
        stream.write(JSON.stringify({ qid: q.id, sid, was: q.conceptId, chose: chosen }) + '\n');
        st.total++;
        if (samples.length < 40 && chosen !== sid) samples.push({ q: q.text.slice(0, 50), cur: null, tgt: nodeById.get(chosen)?.nameEnglish, sid: subjName });
      });
      process.stdout.write(`\r  ${subjName.padEnd(24)} ${Math.min(i + BATCH, qs.length)}/${qs.length} | proposed ${proposed} kept ${kept} rejected ${rejected}`);
    }
    console.log('');
  }
  stream.end();

  console.log('\nPER-SUBJECT audit summary (assignment distribution):');
  for (const [sid, st] of perSubj) {
    const top = [...st.assigned.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, c]) => `${nodeById.get(id)?.nameEnglish}(${c})`).join(', ');
    console.log(`  ${nodeById.get(sid)?.nameEnglish || sid}: total=${st.total} kept=${st.kept} assigned=${st.assigned.size ? [...st.assigned.values()].reduce((a, b) => a + b, 0) : 0}${top ? '  -> ' + top : ''}`);
  }
  console.log('\nSAMPLE assignments:');
  for (const s of samples) console.log(`  [${s.sid}] ${s.q} => ${s.tgt}`);
  console.log(`\nDRY done: proposed=${proposed} kept_subject=${kept} rejected=${rejected} total=${processed + proposed + kept}`);
  console.log(`Proposals at ${PROPOSALS}  -> audit, then: node scripts/refineSubjectLocked.mjs apply`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });