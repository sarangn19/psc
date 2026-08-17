// Combined single-call classifier (bug-fixed). For each batch Gemini/Groq/OpenRouter
// outputs "subjectId:nodeId" per question, picking the specific node directly from
// the full taxonomy catalog. One call per batch. Resumable (SUBJECT-level only).
// Run: node scripts/refineCombined.mjs [dry] [limit=N] [model=llama-3.3-70b-versatile]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2]; }
const argv = process.argv.slice(2);
const DRY = argv.includes('dry');
const LIMIT = Number((argv.find((a) => a.startsWith('limit=')) || 'limit=Infinity').split('=')[1]);
const MODEL = argv.find((a) => a.startsWith('model='))?.split('=')[1] || 'llama-3.3-70b-versatile';
const GEMINI_KEY = process.env.GEMINI_API_KEY, OR_KEY = process.env.OPENROUTER_API_KEY, OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1';
const IS_OR = OPENAI_BASE.includes('openrouter');
const API_KEY = IS_OR ? OR_KEY : OPENAI_KEY;
const USE_GEMINI = MODEL.startsWith('gemini') && !!GEMINI_KEY;
const USE_OPENAI = !USE_GEMINI && !!API_KEY;
const PROVIDER = USE_GEMINI ? 'Gemini' : (IS_OR ? 'OpenRouter' : 'Groq');
const BATCH = 50, PACE = (USE_GEMINI || USE_OPENAI) ? 3500 : 0;
const prisma = new PrismaClient();

async function gemini(p) { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: p }] }], generationConfig: { temperature: 0, maxOutputTokens: 8192 } }), signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`Gemini ${r.status}`); const j = await r.json(); return j.candidates?.[0]?.content?.parts?.[0]?.text || ''; }
async function openaiChat(p) { const r = await fetch(`${OPENAI_BASE}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: p }], temperature: 0, max_tokens: 8192 }), signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`); const j = await r.json(); const t = j.choices?.[0]?.message?.content || ''; if (!t.trim()) throw new Error('empty'); return t; }
async function callLLM(p) { let e; for (let a = 0; a < 5; a++) { try { const r = USE_GEMINI ? await gemini(p) : await openaiChat(p); if (PACE) await new Promise((r) => setTimeout(r, PACE)); return r; } catch (err) { e = err; await new Promise((r) => setTimeout(r, String(e.message).includes('429') ? 35000 : 1500 * (a + 1))); } } throw e; }
function parsePairs(reply, n) { const pairs = []; const re = /(\d{2,6})\s*:\s*(\d{2,6})/g; let m; while ((m = re.exec(reply)) !== null && pairs.length < n) pairs.push({ sid: +m[1], nid: +m[2] }); while (pairs.length < n) pairs.push({ sid: null, nid: null }); return pairs; }

async function main() {
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, parentId: true, level: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const subjectIds = new Set(nodes.filter((n) => n.level === 'SUBJECT').map((n) => n.id));
  function subjectOf(id) { let c = id, s = new Set(); while (c != null && !s.has(c)) { s.add(c); const n = nodeById.get(c); if (!n) break; if (n.level === 'SUBJECT') return c; c = n.parentId; } return null; }
  const childrenMap = new Map(); for (const n of nodes) { if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []); childrenMap.get(n.parentId).push(n.id); }
  function descendants(id) { const o = [], st = [id]; while (st.length) { const c = st.pop(); for (const ch of (childrenMap.get(c) || [])) { o.push(ch); st.push(ch); } } return o; }
  const subjects = nodes.filter((n) => n.level === 'SUBJECT').map((n) => ({ id: n.id, name: n.nameEnglish })).sort((a, b) => a.name.localeCompare(b.name));
  const subjTopics = new Map(), subjTopicSet = new Map();
  for (const s of subjects) { const top = descendants(s.id).map((id) => nodeById.get(id)).filter((n) => n && (n.level === 'DOMAIN' || n.level === 'TOPIC')).slice(0, 80); subjTopics.set(s.id, top); subjTopicSet.set(s.id, new Set(top.map((n) => n.id))); }
  const catalogStr = subjects.map((s) => `SUBJECT ${s.id} ${s.name}: ${subjTopics.get(s.id).map((n) => `${n.id} ${n.nameEnglish}`).join(', ')}`).join('\n');
  const questions = await prisma.question.findMany({ select: { id: true, text: true, options: true, conceptId: true } });
  const subjectQs = questions.filter((q) => q.conceptId != null && subjectIds.has(q.conceptId));
  console.log('total', questions.length, '| SUBJECT-level', subjectQs.length, DRY ? '(DRY)' : '', '| limit', LIMIT, '| model', MODEL, `(${PROVIDER})`, '| batch', BATCH);
  const target = subjectQs.slice(0, LIMIT);
  const finalMap = new Map();
  for (let i = 0; i < target.length; i += BATCH) {
    const batch = target.slice(i, i + BATCH);
    const qList = batch.map((q, k) => `${k + 1}. Q: ${q.text}  Options: ${(Array.isArray(q.options) ? q.options : []).map((o, j) => String.fromCharCode(65 + j) + ')' + o).join(' ')}`).join('\n');
    const prompt = `Classify each Kerala PSC question into the taxonomy (Subject > Domain > Topic). For each, output the best specific node as "subjectId:nodeId".
If no specific node fits, output "subjectId:subjectId".
Taxonomy (subject id: name -> nodeId nodeName, ...):
${catalogStr}
Questions:
${qList}
Output exactly ${batch.length} lines, each "subjectId:nodeId". No extra text.`;
    let pairs; try { pairs = parsePairs(await callLLM(prompt), batch.length); } catch { pairs = batch.map(() => ({ sid: null, nid: null })); }
    batch.forEach((q, k) => {
      const { sid, nid } = pairs[k];
      let chosen = q.conceptId;
      if (sid != null && subjectIds.has(sid)) { if (nid != null && (nid === sid || subjTopicSet.get(sid)?.has(nid))) chosen = nid; else chosen = sid; }
      finalMap.set(q.id, chosen);
    });
    process.stdout.write(`\r  processed ${Math.min(i + BATCH, target.length)}/${target.length}`);
  }
  let updated = 0, kept = 0, switched = 0; const samples = [];
  for (const q of target) {
    const chosen = finalMap.get(q.id);
    const os = subjectOf(q.conceptId), ns = subjectOf(chosen);
    if (chosen === q.conceptId) kept++; else { if (!DRY) await prisma.question.update({ where: { id: q.id }, data: { conceptId: chosen } }); updated++; if (ns !== os) switched++; }
    if (samples.length < 50) samples.push({ q: q.text.slice(0, 46), cur: nodeById.get(q.conceptId)?.nameEnglish, tgt: nodeById.get(chosen)?.nameEnglish, sw: ns !== os });
  }
  console.log('\nSAMPLES:'); for (const s of samples) console.log(`  ${s.q} => ${s.cur} -> ${s.tgt}${s.sw ? ' [SWITCH]' : ''}`);
  console.log(`\n${DRY ? 'DRY ' : ''}updated=${updated} kept=${kept} switches=${switched} processed=${target.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
