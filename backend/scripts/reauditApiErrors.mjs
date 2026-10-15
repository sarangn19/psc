/**
 * reauditApiErrors.mjs
 * ---------------------
 * Re-audits questions that got an `api_error` verdict in the Gemini audit
 * (those batches failed, so they were never actually checked).
 *
 * - Reads api_error IDs from audit_verdicts.jsonl
 * - Re-runs them through Groq (qwen3.8-27b) with Gemini fallback
 * - Appends real verdicts to reaudit_verdicts.jsonl as it goes (resume-safe)
 * - At the end, merges: api_error lines removed from audit_verdicts.jsonl,
 *   new verdicts appended; new bad verdicts appended to audit_bad.jsonl
 *
 * Usage:
 *   node backend/scripts/reauditApiErrors.mjs            # full re-audit
 *   node backend/scripts/reauditApiErrors.mjs limit=10   # smoke test
 *   node backend/scripts/reauditApiErrors.mjs merge      # just merge saved verdicts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
if (!GEMINI_KEY && !GROQ_KEY) { console.error('❌ Need GEMINI_API_KEY or GROQ_API_KEY in backend/.env'); process.exit(1); }

const argv = process.argv.slice(2);
const MERGE = argv.includes('merge');
const LIMIT = Number((argv.find(a => a.startsWith('limit=')) || 'limit=999999').split('=')[1]);
const BATCH = 10;
const DELAY_MS = 3000;

const VERDICTS_FILE = path.resolve(__dirname, 'audit_verdicts.jsonl');
const BAD_FILE      = path.resolve(__dirname, 'audit_bad.jsonl');
const REAUDIT_FILE  = path.resolve(__dirname, 'reaudit_verdicts.jsonl');

// ── LLM call (Groq primary, Gemini fallback) ──
// Groq 429s are treated as transient (cooldown + retry).
// Gemini 402 (billing) is permanent — thrown immediately.
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

let groqCooldownUntil = 0;

async function callLLM(prompt, retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    // Groq primary (retry even after 429, once cooled down)
    if (GROQ_KEY && Date.now() >= groqCooldownUntil) {
      try {
        const res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            max_tokens: 2048,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const data = await res.json();
          return data.choices?.[0]?.message?.content || '';
        }
        if (res.status === 429) {
          groqCooldownUntil = Date.now() + 60000;
          process.stdout.write('\n   ⚠ Groq 429 — cooling down 60s');
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        if ((res.status === 503 || res.status === 500) && attempt < retries) {
          const wait = Math.min(attempt * 15000, 60000);
          process.stdout.write(`\n   ⏳ Groq ${res.status} — retrying in ${wait/1000}s (attempt ${attempt}/${retries})...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        const err = await res.text();
        throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
      } catch (err) {
        if (err.message.startsWith('Groq')) throw err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        throw err;
      }
    }
    // Gemini fallback (only when Groq is cooling down / unavailable)
    if (GEMINI_KEY) {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      if (res.status === 402) throw new Error('Gemini 402: credits depleted — top up Gemini or wait for Groq cooldown');
      if ((res.status === 429 || res.status === 503 || res.status === 500) && attempt < retries) {
        const wait = Math.min(attempt * 15000, 60000);
        process.stdout.write(`\n   ⏳ Gemini ${res.status} — retrying in ${wait/1000}s (attempt ${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      const err = await res.text();
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
    }
    throw new Error('No API keys available');
  }
}

// ── Prompt / parsing — same as geminiAudit.mjs ──
const LETTERS = ['A', 'B', 'C', 'D'];

function buildPrompt(questions) {
  const items = questions.map((q, qi) => {
    const opts = q.options.map((o, i) => `  ${LETTERS[i]}. ${o}`).join('\n');
    return `Q${qi + 1} [ID:${q.id}] (Chapter: ${q.chapter.name})
Question: ${q.text}
${opts}
Marked correct: ${LETTERS[q.correctOption]}. ${q.options[q.correctOption]}`;
  }).join('\n\n');

  return `You are a Kerala PSC exam expert. Audit each question below.

For EACH question return a JSON object on its own line (no extra text, no markdown):
{"id":"<ID>","valid":<true/false>,"answerCorrect":<true/false>,"reason":"<one line>"}

Rules:
- valid=false if: question is garbled/unclear/incomplete, or options are nonsense/duplicates
- answerCorrect=false if: the marked answer is factually wrong
- reason: keep it under 15 words; write "OK" if everything is fine
- Base answers on verified facts about Kerala history, geography, Indian constitution, general science, current affairs

Questions:
${items}`;
}

function parseVerdicts(text, questions) {
  const results = [];
  for (const q of questions) {
    const line = text.split('\n').find(l => l.includes(`"id":"${q.id}"`));
    if (!line) {
      results.push({ id: q.id, valid: true, answerCorrect: true, reason: 'parse_miss', chapter: q.chapter.name, text: q.text.slice(0, 80) });
      continue;
    }
    try {
      const parsed = JSON.parse(line.trim());
      results.push({ ...parsed, chapter: q.chapter.name, text: q.text.slice(0, 80) });
    } catch {
      results.push({ id: q.id, valid: true, answerCorrect: true, reason: 'parse_error', chapter: q.chapter.name, text: q.text.slice(0, 80) });
    }
  }
  return results;
}

// ── Merge mode ───────────────────────────────────────────────────────
function merge() {
  if (!fs.existsSync(REAUDIT_FILE)) { console.log('No reaudit_verdicts.jsonl yet — nothing to merge.'); process.exit(0); }
  const lines = fs.readFileSync(VERDICTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const keep = lines.filter(l => { try { return JSON.parse(l).reason !== 'api_error'; } catch { return true; } });
  const newOnes = fs.readFileSync(REAUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const real = newOnes.filter(l => { try { return JSON.parse(l).reason !== 'api_error'; } catch { return false; } });
  const bads = real.filter(l => { try { const v = JSON.parse(l); return !v.valid || !v.answerCorrect; } catch { return false; } });
  if (bads.length) fs.appendFileSync(BAD_FILE, bads.join('\n') + '\n');
  fs.writeFileSync(VERDICTS_FILE, [...keep, ...real].join('\n') + '\n');
  const stillErr = newOnes.length - real.length;
  console.log(`✅ Merged ${real.length} re-audited verdicts (${bads.length} bad) into audit files.`);
  if (stillErr > 0) console.log(`   ⚠ ${stillErr} still api_error — re-run the audit for those before merging again.`);
  console.log('   Now run: node backend/scripts/applyAuditToPractice.mjs');
}

if (MERGE) { merge(); process.exit(0); }

// ── Main ──────────────────────────────────────────────────────────────
const prisma = new PrismaClient();

async function main() {
  // api_error IDs from verdicts
  const lines = fs.readFileSync(VERDICTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const apiErrIds = new Set();
  for (const l of lines) {
    try { if (JSON.parse(l).reason === 'api_error') apiErrIds.add(JSON.parse(l).id); } catch {}
  }
  console.log(`🔍 api_error questions to re-audit: ${apiErrIds.size}`);

  // already re-audited with a REAL verdict (resume support — api_error lines are retried)
  const doneIds = new Set();
  if (fs.existsSync(REAUDIT_FILE)) {
    for (const l of fs.readFileSync(REAUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean)) {
      try { const v = JSON.parse(l); if (v.reason !== 'api_error') doneIds.add(v.id); } catch {}
    }
    console.log(`   Already re-audited (resuming): ${doneIds.size}`);
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: [...apiErrIds] } },
    select: { id: true, text: true, options: true, correctOption: true, chapter: { select: { name: true } } },
    orderBy: { id: 'asc' },
  });

  const toAudit = questions.filter(q => !doneIds.has(q.id)).slice(0, LIMIT);
  console.log(`   Remaining to audit: ${toAudit.length}`);
  if (toAudit.length === 0) { console.log('   Nothing to do. Run with "merge" to finalize.'); await prisma.$disconnect(); return; }
  console.log(`   Est. time: ~${Math.ceil(toAudit.length / BATCH * DELAY_MS / 60000)} min\n`);

  let badCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < toAudit.length; i += BATCH) {
    const batch = toAudit.slice(i, i + BATCH);
    let verdicts;
    try {
      const raw = await callLLM(buildPrompt(batch));
      verdicts = parseVerdicts(raw, batch);
    } catch (err) {
      console.error(`\n   ⚠ Batch ${i}-${i + BATCH} failed: ${err.message} — keeping api_error`);
      verdicts = batch.map(q => ({ id: q.id, valid: true, answerCorrect: true, reason: 'api_error', chapter: q.chapter.name, text: q.text.slice(0, 80) }));
    }

    // incremental save (resume-safe)
    fs.appendFileSync(REAUDIT_FILE, verdicts.map(v => JSON.stringify(v)).join('\n') + '\n');

    const bads = verdicts.filter(v => !v.valid || !v.answerCorrect);
    badCount += bads.length;

    const done = i + batch.length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rate = done / Math.max(elapsed, 1);
    const remaining = Math.round((toAudit.length - done) / rate / 60);
    process.stdout.write(`\r   Progress: ${done}/${toAudit.length} | Bad: ${badCount} | ETA: ~${remaining}m   `);

    if (i + BATCH < toAudit.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n\n✅ Re-audit pass complete! Bad found: ${badCount}`);
  console.log('   Run with "merge" to finalize, then applyAuditToPractice.mjs');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
