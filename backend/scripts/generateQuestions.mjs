// #04: Generate new Kerala PSC questions with Gemini, tagged to an EXACT taxonomy
// node chosen by the caller (not by the model) => hierarchy is correct by construction.
// Each target DOMAIN/TOPIC node yields fresh MCQs; chapter theme also chosen in-call.
//
// Pipeline: dry (JSONL only) -> audit -> apply.
//   node scripts/generateQuestions.mjs nodeids=614,48 limit=30 model=gemini-flash-latest
//   node scripts/generateQuestions.mjs dry subject=48 limit=60 percall=3
//   node scripts/generateQuestions.mjs apply
// Flags: nodeids=A,B (target specific nodes) | subject=S (all specific nodes under subject S)
//        percall=N (questions per call, default 3) | limit=N | model=...
//        --except=N1,N2 (skip topics) present in both dry & apply.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { CHAPTER_KEYWORDS, loadChapterNameMap, ensureUncategorizedChapter, isBad, normalizeText, loadExistingNormalizedTexts } from './lib/pscMapping.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2];
}
const argv = process.argv.slice(2);
const APPLY = argv.includes('apply');
const MODEL = argv.find((a) => a.startsWith('model='))?.split('=')[1] || 'gemini-flash-latest';
const LIMIT = Number((argv.find((a) => a.startsWith('limit=')) || 'limit=1e9').split('=')[1]);
const PERCALL = Number((argv.find((a) => a.startsWith('percall=')) || 'percall=3').split('=')[1]);
const NODEIDS = (argv.find((a) => a.startsWith('nodeids='))?.split('=')[1] || process.env.GEN_NODEIDS || '').split(',').filter(Boolean).map(Number);
const SUBJECT = Number((argv.find((a) => a.startsWith('subject='))?.split('=')[1] || process.env.GEN_SUBJECT || '0').split('=')[0]);
let EXCEPT = new Set();
for (const a of argv) { if (a.replace(/^--?/, '').startsWith('except=')) EXCEPT = new Set(a.split('=').slice(1).join('=').split(',').map(Number)); }

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1';
const IS_OR = OPENAI_BASE.includes('openrouter');
const API_KEY = IS_OR ? OR_KEY : OPENAI_KEY;
const USE_GEMINI = MODEL.startsWith('gemini') && !!GEMINI_KEY;
if (!USE_GEMINI && !API_KEY) { console.error('No API key.'); process.exit(1); }
const BATCH_CREATE = 200;
const PACE = 30000;
const PROPOSALS = path.resolve(__dirname, '_generated_proposals.jsonl');
const TAG = 'ai:generated';
const prisma = new PrismaClient();

async function callLLM(prompt, tries = 0) {
  if (USE_GEMINI) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 8000 } }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) {
      const body = await res.text();
      if ((res.status === 429 || res.status === 503 || res.status === 500) && tries < 5) {
        const wait = 10000 * 2 ** tries + Math.floor(Math.random() * 5000);
        process.stderr.write(`\r  [retry ${tries + 1} in ${wait / 1000}s] ${MODEL} HTTP ${res.status}... `);
        await sleep(wait);
        return callLLM(prompt, tries + 1);
      }
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 4096 }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const body = await res.text();
    if ((res.status === 429 || res.status === 503 || res.status === 500) && tries < 5) {
      const wait = 10000 * 2 ** tries + Math.floor(Math.random() * 5000);
      process.stderr.write(`\r  [retry ${tries + 1} in ${wait / 1000}s] ${MODEL} HTTP ${res.status}... `);
      await sleep(wait);
      return callLLM(prompt, tries + 1);
    }
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

const CHAPTER_THEMES = Object.keys(CHAPTER_KEYWORDS).sort();

function extractJsonArray(txt) {
  txt = (txt || '').replace(/```json|```/g, '').trim();
  const a = txt.indexOf('['), b = txt.lastIndexOf(']');
  if (a < 0 || b < a) return [];
  try { const arr = JSON.parse(txt.slice(a, b + 1)); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

function tidy(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

async function main() {
  if (APPLY) {
    if (!fs.existsSync(PROPOSALS)) { console.error('No proposals file - run dry first.'); process.exit(1); }
    const folder = path.dirname(PROPOSALS);
    const appliedName = path.join(folder, '_generated_applied.jsonl');
    const lines = fs.readFileSync(PROPOSALS, 'utf8').trim().split('\n').filter(Boolean);
const chapterByName = await loadChapterNameMap(prisma);
      const uncatId = await ensureUncategorizedChapter(prisma);
      const existing = await loadExistingNormalizedTexts(prisma);
      const rows = [];
      let dups = 0, bad = 0;
      const seen = new Set();
      const appliedStream = fs.createWriteStream(appliedName, { flags: 'a' });
      for (const l of lines) {
        const rec = JSON.parse(l);
        if (EXCEPT.size && EXCEPT.has(rec.nodeId)) continue;
        const norm = normalizeText(rec.q);
        if (!norm || seen.has(norm) || existing.has(norm)) { dups++; continue; }
        const chapterId = chapterByName(rec.chapter) || uncatId;
        if (!rec.nodeId || !rec.opts || rec.opts.length !== 4 || !rec.opts.every((o) => o && !isBad(o)) || isBad(rec.q) || !Number.isInteger(rec.a) || rec.a < 0 || rec.a > 3) { bad++; continue; }
        const difficulty = ['EASY', 'MEDIUM', 'HARD'].includes(rec.d) ? rec.d : 'MEDIUM';
        seen.add(norm);
        rows.push({
          chapterId, conceptId: rec.nodeId, text: rec.q, options: rec.opts,
          correctOption: rec.a, explanation: rec.exp || undefined,
          difficulty, tags: [TAG, `node:${rec.nodeId}`, `gen:${(rec.chapter || '?').toLowerCase().replace(/\s+/g, '-')}`], isActive: true,
        });
        appliedStream.write(JSON.stringify({ nodeId: rec.nodeId, q: rec.q, chapter: rec.chapter, difficulty }) + '\n');
      }
    appliedStream.end();
    for (let i = 0; i < rows.length; i += BATCH_CREATE) {
      await prisma.question.createMany({ data: rows.slice(i, i + BATCH_CREATE) });
    }
    const demo = await prisma.user.findUnique({ where: { email: 'demo@student.com' } });
    if (demo) {
      for (const cid of [...new Set(rows.map((r) => r.chapterId))]) {
        await prisma.userChapter.upsert({
          where: { userId_chapterId: { userId: demo.id, chapterId: cid } },
          update: { isLearned: true },
          create: { userId: demo.id, chapterId: cid, isLearned: true },
        });
      }
    }
    console.log(JSON.stringify({ applied: rows.length, duplicates: dups, rejected_shape: bad, new_total: await prisma.question.count() }, null, 2));
    fs.unlinkSync(PROPOSALS);
    await prisma.$disconnect();
    return;
  }

  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, parentId: true, level: true, nameEnglish: true } });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // resolve targets: explicit ids or all specific nodes in a subject's subtree
  let targets = [];
  if (NODEIDS.length) {
    targets = NODEIDS.map((id) => byId.get(id)).filter(Boolean);
  } else if (SUBJECT) {
    const sub = byId.get(SUBJECT);
    if (!sub) { console.error(`No node id ${SUBJECT}`); process.exit(1); }
    const stack = [SUBJECT];
    const ids = [];
    while (stack.length) { const c = stack.pop(); for (const n of nodes) if (n.parentId === c) { ids.push(n.id); stack.push(n.id); } }
    targets = ids.map((id) => byId.get(id)).filter((n) => n && (n.level === 'DOMAIN' || n.level === 'TOPIC') && !EXCEPT.has(n.id));
  } else {
    targets = nodes.filter((n) => (n.level === 'DOMAIN' || n.level === 'TOPIC') && !EXCEPT.has(n.id));
  }
  // subject ancestry for context + enforced subtree guard
  const subjectOf = (id) => { let n = byId.get(id); while (n && n.level !== 'SUBJECT') n = byId.get(n.parentId); return n || null; };
  const subjChildren = new Map();
  for (const n of nodes) if (n.parentId) { (subjChildren.get(n.parentId) || subjChildren.set(n.parentId, []).get(n.parentId)).push(n.id); }
  // specific subtree of each subject (for the chapter-theme guard)
  const specSet = new Map();
  for (const t of targets) { const s = subjectOf(t.id); if (s) { if (!specSet.has(s.id)) specSet.set(s.id, new Set()); const st = [t.id]; while (st.length) { const c = st.pop(); specSet.get(s.id).add(c); for (const ch of (subjChildren.get(c) || [])) st.push(ch); } } }

  const chapterByName = await loadChapterNameMap(prisma);
  const uncatId = await ensureUncategorizedChapter(prisma);
  const existing = await loadExistingNormalizedTexts(prisma);

  const stream = fs.createWriteStream(PROPOSALS, { flags: 'a' });
  const seenSet = new Set();
  if (fs.existsSync(PROPOSALS)) {
    for (const l of fs.readFileSync(PROPOSALS, 'utf8').trim().split('\n').filter(Boolean)) {
      const rec = JSON.parse(l);
      const n = normalizeText(rec.q);
      if (n) seenSet.add(n);
    }
  }
  if (fs.existsSync(PROPOSALS)) console.log('resuming with', seenSet.size, 'already-proposed texts in file');
  let created = 0, dups = 0, bad = 0, batchIdx = 0;
  const samples = [];

// round-robin: one batch per target per sweep, repeat until LIMIT
  while (created < LIMIT) {
    let sweepMade = 0;
    for (const t of targets) {
      if (created >= LIMIT) break;
      const subj = subjectOf(t.id);
      const subjName = subj ? subj.nameEnglish : t.nameEnglish;
      const parentNames = [];
      let cur = byId.get(t.parentId);
      while (cur && cur.level !== 'SUBJECT') { parentNames.unshift(cur.nameEnglish); cur = byId.get(cur.parentId); }
      const path = [...parentNames, t.nameEnglish].join(' > ');

      const need = Math.min(PERCALL, LIMIT - created);
      const themes = CHAPTER_THEMES.join(', ');
      const prompt = `Write ${need} NEW, distinct, Kerala PSC exam style multiple-choice questions for the topic "${path}". They must actually test real knowledge of that topic (factual, exam-realistic - LDC / LGS / Secretariat level). Mix English and Malayalam sensibly (use Malayalam where the fact is Kerala-specific). Requirements per question:
- 4 short options (A-D), exactly one clearly correct
- a short 1-2 line factual explanation
- a difficulty of EASY (basic recall) or MEDIUM (standard PSC level) or HARD (tricky/advanced, applied)
- a chapter from this exact list: ${themes}
Return ONLY a JSON array of ${need} objects, no commentary, shape:
[{"q":"question text","o":["a","b","c","d"],"a":2,"e":"why correct","chapter":"Chapter Theme","d":"MEDIUM"}, ...]`
      let arr = [];
      try { arr = extractJsonArray(await callLLM(prompt)); } catch (e) { console.error('  call failed:', e.message.slice(0, 100)); await sleep(PACE); continue; }
      batchIdx++;
      if (arr.length === 0) continue;
      sweepMade++;
      let edited = 0;
      for (const r of arr) {
        if (created >= LIMIT) break;
        const q = tidy(r.q), exp = tidy(r.e);
        const opts = Array.isArray(r.o) ? r.o.map(tidy) : [];
        const theme = CHAPTER_THEMES.includes(r.chapter) ? r.chapter
          : CHAPTER_THEMES.find((c) => c.toLowerCase() === String(r.chapter || '').toLowerCase())
          || CHAPTER_THEMES.find((c) => c.toLowerCase().includes(String(r.chapter || '').toLowerCase()))
          || CHAPTER_THEMES.find((c) => String(r.chapter || '').toLowerCase().includes(c.toLowerCase()));
        const ok = q.length > 8 && opts.length === 4 && opts.every((o) => o) && Number.isInteger(r.a) && r.a >= 0 && r.a <= 3 && !isBad(q) && !opts.some(isBad);
        const norm = normalizeText(q);
        if (!ok) { bad++; continue; }
        if (!theme || !chapterByName(theme)) { bad++; continue; }
        if (!norm || seenSet.has(norm) || existing.has(norm)) { dups++; continue; }
        const qidPseudo = `${t.id}:${created}`;
        seenSet.add(norm);
        stream.write(JSON.stringify({ pseudo: qidPseudo, nodeId: t.id, path, subj: subjName, q, opts, a: r.a, exp, chapter: theme, d: ['EASY', 'MEDIUM', 'HARD'].includes(r.d) ? r.d : 'MEDIUM' }) + '\n');
        if (samples.length < 30) samples.push({ path, q: q.slice(0, 55), a: opts[r.a], chapter: theme });
        created++; edited++;
      }
      await sleep(PACE);
      if (edited === 0) break; // nothing accepted from this target — move on
    }
    if (sweepMade === 0) break; // no progress in a whole sweep
  }
  stream.end();
  console.log('\nSAMPLE (new questions):');
  for (const s of samples) console.log(`  [${s.path}] ${s.q} => ${s.a}  (${s.chapter})`);
  console.log(`\nDRY done: proposed=${created} duplicates_skipped=${dups} rejected_shape=${bad} of limit=${LIMIT}\nProposals: ${PROPOSALS} -> node scripts/generateQuestions.mjs apply`);
  await prisma.$disconnect();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
main().catch((e) => { console.error(e); process.exit(1); });