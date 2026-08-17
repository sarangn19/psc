// Semantic concept refinement (#4). Two-stage classifier via cloud LLM
// (Gemini / Groq / OpenRouter). Stage 1 picks SUBJECT; stage 2 picks the specific
// node from that subject's DOMAIN/TOPIC nodes. INCREMENTAL: updates are applied
// per batch, and stage-1 results are checkpointed, so interrupted runs persist
// and resumes skip already-refined questions (only SUBJECT-level are processed).
// Run: node scripts/refineConceptsLLM.mjs [dry] [limit=N] [model=gemini-3-flash-preview]
// env: GEMINI_API_KEY (or OPENROUTER_API_KEY / OPENAI_API_KEY + OPENAI_BASE_URL)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2];
}
const argv = process.argv.slice(2);
const DRY = argv.includes('dry');
const LIMIT = Number((argv.find((a) => a.startsWith('limit=')) || 'limit=1e9').split('=')[1]);
const MODEL = argv.find((a) => a.startsWith('model='))?.split('=')[1] || 'gemini-3-flash-preview';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1';
const IS_OR = OPENAI_BASE.includes('openrouter');
const API_KEY = IS_OR ? OR_KEY : OPENAI_KEY;
const USE_GEMINI = MODEL.startsWith('gemini') && !!GEMINI_KEY;
const USE_OPENAI = !USE_GEMINI && !!API_KEY;
if (USE_GEMINI && !GEMINI_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
if (!USE_GEMINI && !USE_OPENAI) { console.error('No API key set'); process.exit(1); }
const PROVIDER = USE_GEMINI ? 'Gemini' : (IS_OR ? 'OpenRouter' : 'Groq');
const BATCH = 60;
const PACE = (USE_GEMINI || USE_OPENAI) ? 2500 : 0; // paid tiers: ~24 req/min is safe
const CHK = path.resolve(__dirname, '_stage1_chk.json');
const prisma = new PrismaClient();

async function gemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 10000 } });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
async function openaiChat(prompt) {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 8192 }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content || '';
  if (!txt.trim()) throw new Error(`OpenAI empty completion (HTTP ${res.status})`);
  return txt;
}
async function callLLM(prompt) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = USE_GEMINI ? await gemini(prompt) : await openaiChat(prompt);
      if (PACE) await new Promise((res) => setTimeout(res, PACE));
      return r;
    } catch (e) {
      lastErr = e;
      const is429 = String(e.message).includes('429');
      await new Promise((res) => setTimeout(res, is429 ? 30000 : 1200 * (attempt + 1)));
    }
  }
  throw lastErr;
}
function parseIds(reply, n) { const ids = []; const re = /(\d{2,6})/g; let m; while ((m = re.exec(reply)) !== null && ids.length < n) ids.push(+m[1]); while (ids.length < n) ids.push(null); return ids; }
function qline(q, k) { return `${k + 1}. ${q.text}  Options: ${(Array.isArray(q.options) ? q.options : []).map((o, j) => String.fromCharCode(65 + j) + ')' + o).join(' ')}`; }

async function main() {
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, parentId: true, level: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const subjectIds = new Set(nodes.filter((n) => n.level === 'SUBJECT').map((n) => n.id));
  function subjectOf(id) { let cur = id, seen = new Set(); while (cur != null && !seen.has(cur)) { seen.add(cur); const n = nodeById.get(cur); if (!n) break; if (n.level === 'SUBJECT') return cur; cur = n.parentId; } return null; }
  const childrenMap = new Map(); for (const n of nodes) { if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []); childrenMap.get(n.parentId).push(n.id); }
  function descendants(id) { const out = []; const stack = [id]; while (stack.length) { const c = stack.pop(); for (const ch of (childrenMap.get(c) || [])) { out.push(ch); stack.push(ch); } } return out; }
  const subjects = nodes.filter((n) => n.level === 'SUBJECT').map((n) => ({ id: n.id, name: n.nameEnglish || `id${n.id}` })).sort((a, b) => a.name.localeCompare(b.name));
  const subjTopics = new Map();
  for (const s of subjects) { const top = descendants(s.id).map((id) => nodeById.get(id)).filter((n) => n && (n.level === 'DOMAIN' || n.level === 'TOPIC')).slice(0, 100); subjTopics.set(s.id, top); }
  const questions = await prisma.question.findMany({ select: { id: true, text: true, options: true, conceptId: true } });
  const subjectQs = questions.filter((q) => q.conceptId != null && subjectIds.has(q.conceptId)).slice(0, LIMIT);
  console.log('total', questions.length, '| SUBJECT-level to process', subjectQs.length, DRY ? '(DRY)' : '', '| model', MODEL, `(${PROVIDER})`, '| batch', BATCH);

  // STAGE 1: subject per question (checkpointed)
  let stage1 = new Map();
  if (fs.existsSync(CHK) && !process.env.NOCHK) { try { stage1 = new Map(Object.entries(JSON.parse(fs.readFileSync(CHK, 'utf8'))).map(([k, v]) => [String(k), v])); } catch {} }
  const need = subjectQs.filter((q) => !stage1.has(q.id));
  console.log(`stage1: ${stage1.size} checkpointed, ${need.length} to classify`);
  for (let i = 0; i < need.length; i += BATCH) {
    const batch = need.slice(i, i + BATCH);
    const prompt = `Classify each Kerala PSC question into exactly one academic SUBJECT. Output one subject id per line in order, nothing else.
${subjects.map((s) => `${s.id} = ${s.name}`).join('\n')}
IMPORTANT: Do NOT default to General Knowledge. Choose the specific subject the question primarily tests. Heuristics: Laws/Acts/Constitution/Polity -> Indian Constitution (614) or Indian Polity (122); grammar/fill-in-the-blank/vocabulary/prepositions -> English (404); math series/analogies/puzzles -> Mental Ability (302) or Quantitative Aptitude (355); medicine/biology/anatomy/pharmacology/disease -> General Science (295); economics/policy/committees/budget -> Economics (152); IT/MIS/software/e-governance -> Information Technology (457); general reasoning -> General Knowledge (2) only if truly cross-subject.
Example: "Hormone produced by posterior lobe of pituitary gland" -> 295 (General Science)
Example: "Which committee recommended enactment of the FRBM Act" -> 152 (Economics)
Example: "The furniture _________ brought from Italy" -> 404 (English)
Example: "The Scheduled Castes and Scheduled Tribes Prevention of Atrocities Act" -> 614 (Indian Constitution)
Questions:
${batch.map(qline).join('\n')}
Output exactly ${batch.length} lines, each just the subject id number.`;
    let ids; try { ids = parseIds(await callLLM(prompt), batch.length); } catch { ids = batch.map(() => null); }
    batch.forEach((q, k) => {
      const c = ids[k]; let subj = q.conceptId;
      if (c != null) { if (subjectIds.has(c)) subj = c; else { const s = subjectOf(c); if (s != null) subj = s; } }
      stage1.set(q.id, subj);
    });
    fs.writeFileSync(CHK, JSON.stringify(Object.fromEntries([...stage1.entries()].map(([k, v]) => [k, v]))));
    process.stdout.write(`\r  stage1 ${Math.min(i + BATCH, need.length)}/${need.length}`);
  }
  console.log('');

  // STAGE 2: node within chosen subject, applied incrementally per batch
  const groups = new Map();
  for (const q of subjectQs) { const sid = stage1.get(q.id) ?? q.conceptId; (groups.get(sid) || groups.set(sid, []).get(sid)).push(q); }
  let updated = 0, kept = 0, switched = 0; const samples = []; let processed = 0;
  for (const [sid, qs] of groups) {
    const topicList = subjTopics.get(sid);
    const subjName = nodeById.get(sid)?.nameEnglish;
    for (let i = 0; i < qs.length; i += BATCH) {
      const batch = qs.slice(i, i + BATCH);
      const prompt = `Pick the single best specific topic node for each Kerala PSC question, from the list below (all under "${subjName}"). Output one node id per line in order.
${topicList.map((n) => `${n.id} = ${n.nameEnglish}`).join('\n')}
If none fits well, output ${sid}.
Questions:
${batch.map(qline).join('\n')}
Output exactly ${batch.length} lines, each just the node id number.`;
      let ids; try { ids = parseIds(await callLLM(prompt), batch.length); } catch { ids = batch.map(() => null); }
      const writes = [];
      batch.forEach((q, k) => {
        const nid = ids[k];
        const valid = nid != null && (nid === sid || topicList.some((n) => n.id === nid));
        const chosen = valid ? nid : sid;
        const os = subjectOf(q.conceptId), ns = subjectOf(chosen);
        if (chosen === q.conceptId) kept++; else { updated++; if (ns !== os) switched++; }
        if (!DRY) writes.push(prisma.question.update({ where: { id: q.id }, data: { conceptId: chosen } }));
        processed++;
        if (samples.length < 60 && chosen !== q.conceptId) samples.push({ q: q.text.slice(0, 46), cur: nodeById.get(q.conceptId)?.nameEnglish, tgt: nodeById.get(chosen)?.nameEnglish });
      });
      await Promise.all(writes);
      process.stdout.write(`\r  stage2 subj ${sid} ${Math.min(i + BATCH, qs.length)}/${qs.length} | updated ${updated}`);
    }
    console.log('');
  }
  console.log('SAMPLES:');
  for (const s of samples) console.log(`  ${s.q} => ${s.cur} -> ${s.tgt}`);
  console.log(`\n${DRY ? 'DRY ' : ''}updated=${updated} kept=${kept} switches=${switched} processed=${processed}`);
  if (fs.existsSync(CHK)) fs.unlinkSync(CHK);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });