/**
 * auditEnglishAlignment.mjs
 * -------------------------
 * Audits whether questions filed under English chapters actually belong there.
 * Uses Groq (primary) / Gemini (fallback) — same harness as geminiAudit.mjs.
 *
 * Usage:
 *   node backend/scripts/auditEnglishAlignment.mjs count scope=psc
 *   node backend/scripts/auditEnglishAlignment.mjs scope=psc prefilter=0
 *   node backend/scripts/auditEnglishAlignment.mjs scope=banking prefilter=1 resume
 *   node backend/scripts/auditEnglishAlignment.mjs summary
 *
 * Scopes: psc | banking | ssc | all   (default all)
 * prefilter=1 keeps only suspicious questions (concept subject != English/Verbal,
 *   null concept, or topic/chapter token mismatch); prefilter=0 audits everything.
 *
 * Output (backend/scripts/):
 *   eng_alignment_verdicts.jsonl — every audited question (resume-safe append)
 *   eng_alignment_bad.jsonl      — misaligned only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY && !GROQ_KEY && !GEMINI_KEY) { console.error('Need OPENROUTER_API_KEY / GROQ_API_KEY / GEMINI_API_KEY in backend/.env'); process.exit(1); }

const argv = process.argv.slice(2);
const RESUME = argv.includes('resume');
const SUMMARY = argv.includes('summary');
const COUNT = argv.includes('count');
const PREFILTER = argv.find((a) => a.startsWith('prefilter='))?.split('=')[1] !== '0';
const SCOPE = argv.find((a) => a.startsWith('scope='))?.split('=')[1] || 'all';
const DELAY_MS = Number(argv.find((a) => a.startsWith('delay='))?.split('=')[1] || 4000);

const VERDICTS_FILE = path.resolve(__dirname, 'eng_alignment_verdicts.jsonl');
const BAD_FILE = path.resolve(__dirname, 'eng_alignment_bad.jsonl');
const BATCH = 5;

const SSC_EXAMS = ['SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC GD Constable'];
const BANKING_EXAMS = ['IBPS PO', 'IBPS Clerk', 'SBI PO', 'SBI Clerk', 'IBPS RRB Officer Scale I', 'IBPS RRB Office Assistant', 'RBI Grade B', 'Banking Exams (IBPS/SBI)'];

if (SUMMARY) {
  if (!fs.existsSync(VERDICTS_FILE)) { console.log('No verdicts yet.'); process.exit(0); }
  const verdicts = fs.readFileSync(VERDICTS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const bad = verdicts.filter((v) => v.aligned === false);
  console.log(`Audited: ${verdicts.length} | Misaligned: ${bad.length}`);
  const byChapter = new Map();
  for (const v of bad) byChapter.set(v.chapter, (byChapter.get(v.chapter) || 0) + 1);
  for (const [c, n] of [...byChapter.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${c}`);
  process.exit(0);
}

// ── LLM harness: OpenRouter primary, Groq secondary, Gemini last ─────────────
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const OR_MODEL = 'openai/gpt-4o-mini';

async function openrouterCall(prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_KEY}` },
    body: JSON.stringify({ model: OR_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 1024 }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) { const e = new Error(`openrouter ${res.status}`); e.retryable = res.status === 429 || res.status >= 500; throw e; }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
async function groqCall(prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 1024 }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) { const e = new Error(`groq ${res.status}`); e.retryable = res.status === 429 || res.status >= 500; throw e; }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
async function geminiCall(prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 1024 } }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) { const e = new Error(`gemini ${res.status}`); e.retryable = res.status === 429 || res.status >= 500; throw e; }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

const OLLAMA_MODEL = argv.find((a) => a.startsWith('model='))?.split('=')[1] || 'llama3:latest';
async function ollamaCall(prompt) {
  const res = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, stream: false, temperature: 0, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(300000),
  });
  if (!res.ok) { const e = new Error(`ollama ${res.status}`); e.retryable = res.status >= 500; throw e; }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

const PROVIDERS = [
  { name: 'ollama', fn: ollamaCall, has: true, disabled: false },
  { name: 'openrouter', fn: openrouterCall, has: !!OPENROUTER_KEY, disabled: false },
  { name: 'groq', fn: groqCall, has: !!GROQ_KEY, disabled: false },
  { name: 'gemini', fn: geminiCall, has: !!GEMINI_KEY, disabled: false },
];

async function callLLM(prompt, rounds = 6) {
  let lastErr;
  for (let round = 1; round <= rounds; round++) {
    for (const p of PROVIDERS) {
      if (!p.has || p.disabled) continue;
      try {
        const text = await p.fn(prompt);
        if (text) return text;
        lastErr = new Error(`${p.name}: empty response`);
      } catch (err) {
        lastErr = err;
        if (err.retryable === false) {
          p.disabled = true;
          process.stdout.write(`\n   ${p.name} disabled (${err.message})\n`);
        }
      }
    }
    if (PROVIDERS.every((p) => p.disabled || !p.has)) break;
    const wait = Math.min(round * 15000, 45000);
    process.stdout.write(`\n   all providers busy — waiting ${wait / 1000}s (round ${round}/${rounds})`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw lastErr || new Error('no providers');
}

const LETTERS = ['A', 'B', 'C', 'D'];
function buildPrompt(questions) {
  const items = questions.map((q, qi) => {
    const opts = q.options.map((o, i) => `  ${LETTERS[i]}. ${o}`).join('\n');
    return `Q${qi + 1} [ID:${q.id}] (Exam: ${q.exam} | Chapter: ${q.chapter})\nQuestion: ${q.text}\n${opts}`;
  }).join('\n\n');
  return `You are an exam content reviewer. For EACH question decide whether it belongs in the chapter it is filed under.

For EACH question you MUST do both steps:
Step A - identify what the question is about (its subject/topic, e.g. "Simple Interest (math)", "Synonym (vocabulary)", "Tense (grammar)").
Step B - compare that with the chapter name. aligned=true ONLY if the subject/topic matches the chapter. A well-formed math question filed under an English vocabulary chapter does NOT match -> aligned=false.
If the question's subject is math/science/engineering/history/current affairs/GK while the chapter is an English grammar/vocabulary/comprehension topic, that is ALWAYS aligned=false.

English exercises using other subjects as SENTENCE CONTEXT are aligned=true (economics passage in Reading Comprehension, finance sentence in Sentence Improvement).

Output EXACTLY two lines per question (both required, in this order):
Qn topic: <from step A> | chapter: <chapter name> | match: yes/no
{"id":"<ID>","aligned":<true if match yes, else false>,"reason":"<=8 words","targetTopic":"<if match no: topic <=4 words; else empty>"}

Questions:
${items}`;
}
function parseVerdicts(text, questions) {
  const results = [];
  const lines = text.split('\n');
  for (const [qi, q] of questions.entries()) {
    const n = qi + 1;
    let anchor = lines.findIndex((l) => l.includes(`[ID:${q.id}]`));
    if (anchor < 0) anchor = lines.findIndex((l) => new RegExp(`^\\s*Q${n}\\b`).test(l));
    const window = anchor >= 0 ? lines.slice(anchor, anchor + 6) : [];
    // 1) JSON line inside the block
    const jsonLine = window.find((l) => l.includes('"aligned"') && l.includes('{'));
    if (jsonLine) {
      const start = jsonLine.indexOf('{');
      const end = jsonLine.lastIndexOf('}');
      try {
        if (start >= 0 && end >= start) {
          const parsed = JSON.parse(jsonLine.slice(start, end + 1));
          results.push({ ...parsed, id: q.id, chapter: q.chapter, exam: q.exam, text: q.text.slice(0, 80) });
          continue;
        }
      } catch { /* fall through */ }
    }
    // 2) "match: yes/no" line inside the block
    const matchLine = window.map((l) => l.match(/match:\s*(yes|no)/i)).find(Boolean);
    if (matchLine) {
      const block = window.join(' ');
      const tt = block.match(/targetTopic:\s*([^|"}]+)/i)?.[1]?.trim() || '';
      const topic = block.match(/topic:\s*([^|]+?)\s*\|/i)?.[1]?.trim() || 'unspecified';
      const aligned = /yes/i.test(matchLine[1]);
      results.push({ id: q.id, aligned, reason: topic.slice(0, 60), targetTopic: aligned ? '' : tt, chapter: q.chapter, exam: q.exam, text: q.text.slice(0, 80) });
      continue;
    }
    results.push({ id: q.id, aligned: true, reason: 'parse_miss', targetTopic: '', chapter: q.chapter, exam: q.exam, text: q.text.slice(0, 80) });
  }
  return results;
}

// ── Prefilter helpers ─────────────────────────────────────────────────────────
const STOP = new Set(['and', 'of', 'the', 'in', 'a', 'an', 'for', 'to', 'on', 'or', 'at', 'by', 'is', 'are']);
function tokens(name) {
  return [...new Set(
    name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter((w) => w && !STOP.has(w))
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  )];
}
function overlaps(a, b) {
  const A = tokens(a), B = new Set(tokens(b));
  return A.some((t) => B.has(t));
}
const CONTEXT_CH = /comprehension|cloze|fill|reading|passage/i;

async function main() {
  const prisma = new PrismaClient();
  console.log(`Alignment audit | scope=${SCOPE} prefilter=${PREFILTER ? 1 : 0} resume=${RESUME}`);

  // Distinct concept paths (memoised)
  const pathCache = new Map();
  async function subjDomainTopic(conceptId) {
    if (conceptId == null) return null;
    if (pathCache.has(conceptId)) return pathCache.get(conceptId);
    let node = await prisma.taxonomyNode.findUnique({ where: { id: conceptId } });
    const chain = [];
    while (node) { chain.unshift(node); node = node.parentId ? await prisma.taxonomyNode.findUnique({ where: { id: node.parentId } }) : null; }
    const subject = chain.find((n) => n.level === 'SUBJECT');
    const domain = chain.find((n) => n.level === 'DOMAIN');
    const topic = chain.find((n) => n.level === 'TOPIC');
    const res = { subject: subject?.nameEnglish ?? null, domain: domain?.nameEnglish ?? null, topic: topic?.nameEnglish ?? null, leaf: chain[chain.length - 1]?.nameEnglish ?? null };
    pathCache.set(conceptId, res);
    return res;
  }

  const whereExam = SCOPE === 'psc'
    ? { exam: { name: { notIn: [...SSC_EXAMS, ...BANKING_EXAMS] } } }
    : SCOPE === 'ssc' ? { exam: { name: { in: SSC_EXAMS } } }
      : SCOPE === 'banking' ? { exam: { name: { in: BANKING_EXAMS } } }
        : {};

  const questions = await prisma.question.findMany({
    where: { isActive: true, chapter: { subject: { name: { contains: 'English' }, ...whereExam } } },
    select: {
      id: true, text: true, options: true, conceptId: true,
      chapter: { select: { name: true, subject: { select: { exam: { select: { name: true } } } } } },
    },
    orderBy: { id: 'asc' },
  });
  console.log(`English-chapter questions in scope: ${questions.length}`);

  let toAudit = questions;
  if (PREFILTER) {
    const kept = [];
    let skipContext = 0, skipOverlap = 0;
    for (const q of questions) {
      const ctx = CONTEXT_CH.test(q.chapter.name);
      const info = await subjDomainTopic(q.conceptId);
      if (!info) { kept.push(q); continue; } // null concept → audit
      const subjOK = info.subject === 'English' || (info.subject === 'Mental Ability' && info.domain === 'Verbal Ability');
      if (!subjOK) {
        if (ctx) { skipContext++; kept.push(q); } // context chapters: LLM checks the text
        else { kept.push(q); }
        continue;
      }
      // subject OK — flag if topic clearly mismatched with a form-specific chapter
      if (!ctx && info.topic && !overlaps(q.chapter.name, info.topic) && !overlaps(q.chapter.name, info.leaf)) {
        const grabBag = /grammar basics/i.test(q.chapter.name);
        if (!grabBag) { kept.push(q); continue; }
      }
      skipOverlap++;
    }
    toAudit = kept;
    console.log(`Prefilter kept ${toAudit.length} candidates (${questions.length - toAudit.length} skipped as clearly aligned)`);
  }

  if (COUNT) {
    console.log(`Would audit: ${toAudit.length} (est ~${Math.ceil(toAudit.length / BATCH * DELAY_MS / 60000)} min delays)`);
    await prisma.$disconnect();
    return;
  }

  const auditedIds = new Set();
  if (RESUME && fs.existsSync(VERDICTS_FILE)) {
    for (const line of fs.readFileSync(VERDICTS_FILE, 'utf8').trim().split('\n').filter(Boolean)) {
      try { auditedIds.add(JSON.parse(line).id); } catch {}
    }
    console.log(`Resuming — ${auditedIds.size} already audited`);
  } else if (!RESUME) {
    fs.writeFileSync(VERDICTS_FILE, '');
    fs.writeFileSync(BAD_FILE, '');
    console.log('Fresh run — cleared previous verdicts');
  }
  const queue = toAudit.filter((q) => !auditedIds.has(q.id)).map((q) => ({
    id: q.id, text: q.text, options: q.options, chapter: q.chapter.name, exam: q.chapter.subject.exam.name,
  }));
  console.log(`Queue: ${queue.length}`);

  const startTime = Date.now();
  let done = 0, bad = 0;
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    let verdicts;
    try {
      verdicts = parseVerdicts(await callLLM(buildPrompt(batch)), batch);
    } catch (err) {
      console.error(`\nBatch failed: ${err.message}`);
      verdicts = batch.map((q) => ({ id: q.id, aligned: true, reason: 'api_error', targetTopic: '', chapter: q.chapter, exam: q.exam, text: q.text.slice(0, 80) }));
    }
    fs.appendFileSync(VERDICTS_FILE, verdicts.map((v) => JSON.stringify(v)).join('\n') + '\n');
    const mis = verdicts.filter((v) => v.aligned === false);
    if (mis.length) fs.appendFileSync(BAD_FILE, mis.map((v) => JSON.stringify(v)).join('\n') + '\n');
    bad += mis.length;
    done += batch.length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const eta = Math.round((queue.length - done) / (done / Math.max(elapsed, 1)) / 60);
    process.stdout.write(`\r${done}/${queue.length} | misaligned: ${bad} | ETA ~${eta}m   `);
    if (i + BATCH < queue.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log(`\nDone. audited=${done} misaligned=${bad}`);
  console.log(`Verdicts: ${VERDICTS_FILE}\nBad     : ${BAD_FILE}`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
