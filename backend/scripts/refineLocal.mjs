// Semantic refinement using LOCAL Ollama (no key, no quota). Two-stage:
// stage 1: pick SUBJECT (23 options); stage 2: pick specific node from that
// subject's DOMAIN/TOPIC nodes (~60). Weaker models (8B) handle this better
// than one giant prompt. Resumable: only SUBJECT-level questions processed.
// Run: node scripts/refineLocal.mjs [dry] [limit=N] [model=llama3]

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
const LIMIT = Number((argv.find((a) => a.startsWith('limit=')) || 'limit=Infinity').split('=')[1]);
const MODEL = argv.find((a) => a.startsWith('model='))?.split('=')[1] || 'llama3';
const BATCH = 30;
const prisma = new PrismaClient();

async function ollama(prompt) {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false }), signal: AbortSignal.timeout(120000),
  });
  return (await res.json()).response || '';
}
function parseIds(reply, n) {
  const ids = []; const re = /(\d{2,6})/g; let m;
  while ((m = re.exec(reply)) !== null && ids.length < n) ids.push(+m[1]);
  while (ids.length < n) ids.push(null);
  return ids;
}

async function main() {
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, parentId: true, level: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const subjectIds = new Set(nodes.filter((n) => n.level === 'SUBJECT').map((n) => n.id));
  function subjectOf(id) { let cur = id, seen = new Set(); while (cur != null && !seen.has(cur)) { seen.add(cur); const n = nodeById.get(cur); if (!n) break; if (n.level === 'SUBJECT') return cur; cur = n.parentId; } return null; }
  const childrenMap = new Map();
  for (const n of nodes) { if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []); childrenMap.get(n.parentId).push(n.id); }
  function descendants(id) { const out = []; const stack = [id]; while (stack.length) { const c = stack.pop(); for (const ch of (childrenMap.get(c) || [])) { out.push(ch); stack.push(ch); } } return out; }

  const subjects = nodes.filter((n) => n.level === 'SUBJECT').map((n) => ({ id: n.id, name: n.nameEnglish || `id${n.id}` }));
  const subjTopics = new Map();
  for (const s of subjects) {
    const top = descendants(s.id).map((id) => nodeById.get(id)).filter((n) => n && (n.level === 'DOMAIN' || n.level === 'TOPIC')).slice(0, 60);
    subjTopics.set(s.id, top);
  }

  const questions = await prisma.question.findMany({ select: { id: true, text: true, options: true, conceptId: true } });
  const subjectQs = questions.filter((q) => q.conceptId != null && subjectIds.has(q.conceptId));
  console.log('total', questions.length, '| SUBJECT-level', subjectQs.length, DRY ? '(DRY)' : '', '| limit', LIMIT, '| model', MODEL, '| batch', BATCH);

  const target = subjectQs.slice(0, LIMIT);
  const stage1 = new Map();
  const subjGroups = new Map();
  for (const q of target) (subjGroups.get(q.conceptId) || subjGroups.set(q.conceptId, []).get(q.conceptId)).push(q);

  // STAGE 1: subject per question (batched)
  for (let i = 0; i < target.length; i += BATCH) {
    const batch = target.slice(i, i + BATCH);
    const qList = batch.map((q, k) => `${k + 1}. ${q.text}  Options: ${(Array.isArray(q.options) ? q.options : []).map((o, j) => String.fromCharCode(65 + j) + ')' + o).join(' ')}`).join('\n');
    const prompt = `Classify each Kerala PSC question into one of these subjects. Output one subject id per line in order.
${subjects.map((s) => `${s.id} = ${s.name}`).join('\n')}
Questions:
${qList}
Output exactly ${batch.length} lines, each just the subject id number.`;
    let ids;
    try { ids = parseIds(await ollama(prompt), batch.length); } catch { ids = batch.map(() => null); }
    batch.forEach((q, k) => { const sid = ids[k]; stage1.set(q.id, (sid != null && subjectIds.has(sid)) ? sid : q.conceptId); });
    process.stdout.write(`\r  stage1 ${Math.min(i + BATCH, target.length)}/${target.length}`);
  }
  console.log('');

  const finalMap = new Map();
  for (const [sid, qs] of subjGroups) {
    const topicList = subjTopics.get(sid);
    for (let i = 0; i < qs.length; i += BATCH) {
      const batch = qs.slice(i, i + BATCH);
      const qList = batch.map((q, k) => `${k + 1}. ${q.text}  Options: ${(Array.isArray(q.options) ? q.options : []).map((o, j) => String.fromCharCode(65 + j) + ')' + o).join(' ')}`).join('\n');
      const prompt = `Pick the single best specific topic node for each Kerala PSC question, from the list below (all under ${nodeById.get(sid)?.nameEnglish}).
${topicList.map((n) => `${n.id} = ${n.nameEnglish}`).join('\n')}
If none fits well, output ${sid}.
Questions:
${qList}
Output exactly ${batch.length} lines, each just the node id number.`;
      let ids;
      try { ids = parseIds(await ollama(prompt), batch.length); } catch { ids = batch.map(() => null); }
      batch.forEach((q, k) => {
        const nid = ids[k];
        const valid = nid != null && (nid === sid || topicList.some((n) => n.id === nid));
        finalMap.set(q.id, valid ? nid : sid);
      });
      process.stdout.write(`\r  stage2 subj ${sid} ${Math.min(i + BATCH, qs.length)}/${qs.length}`);
    }
    console.log('');
  }

  let updated = 0, kept = 0, switched = 0; const samples = [];
  for (const q of target) {
    const chosen = finalMap.get(q.id) ?? q.conceptId;
    const os = subjectOf(q.conceptId), ns = subjectOf(chosen);
    if (chosen === q.conceptId) kept++; else { if (!DRY) await prisma.question.update({ where: { id: q.id }, data: { conceptId: chosen } }); updated++; if (ns !== os) switched++; }
    if (samples.length < 40) samples.push({ q: q.text.slice(0, 50), cur: nodeById.get(q.conceptId)?.nameEnglish, tgt: nodeById.get(chosen)?.nameEnglish, sw: ns !== os });
  }
  console.log('SAMPLES:'); for (const s of samples) console.log(`  ${s.q} => ${s.cur} -> ${s.tgt}${s.sw ? ' [SWITCH]' : ''}`);
  console.log(`\n${DRY ? 'DRY ' : ''}updated=${updated} kept=${kept} switches=${switched} processed=${target.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
