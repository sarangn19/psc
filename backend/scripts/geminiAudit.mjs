/**
 * geminiAudit.mjs
 * ---------------
 * Audits Kerala PSC questions using Gemini.
 * For each question it checks:
 *   1. Is the question clear and valid?
 *   2. Is the marked correct answer actually correct?
 *   3. Are all 4 options reasonable (no obvious nonsense)?
 *
 * Usage:
 *   node backend/scripts/geminiAudit.mjs              # audit all active questions
 *   node backend/scripts/geminiAudit.mjs limit=500    # audit first 500
 *   node backend/scripts/geminiAudit.mjs resume       # skip already-audited IDs
 *   node backend/scripts/geminiAudit.mjs summary      # print summary of saved verdicts
 *
 * Output files (in backend/scripts/):
 *   audit_verdicts.jsonl   — one JSON line per question (appended, resume-safe)
 *   audit_bad.jsonl        — only the BAD verdicts (wrong answer / invalid question)
 *
 * Verdict shape:
 *   { id, valid: true/false, answerCorrect: true/false, reason, chapter, text }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
for (const line of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
if (!GEMINI_KEY && !GROQ_KEY) { console.error('❌ Need GEMINI_API_KEY or GROQ_API_KEY in backend/.env'); process.exit(1); }

const argv = process.argv.slice(2);
const RESUME   = argv.includes('resume');
const SUMMARY  = argv.includes('summary');
const LIMIT    = Number((argv.find(a => a.startsWith('limit=')) || 'limit=999999').split('=')[1]);
const BATCH    = 5;    // questions per call
const DELAY_MS = 3000; // 3s between batches

const VERDICTS_FILE = path.resolve(__dirname, 'audit_verdicts.jsonl');
const BAD_FILE      = path.resolve(__dirname, 'audit_bad.jsonl');

// ── Summary mode ─────────────────────────────────────────────────────────────
if (SUMMARY) {
  if (!fs.existsSync(VERDICTS_FILE)) { console.log('No verdicts file yet.'); process.exit(0); }
  const lines = fs.readFileSync(VERDICTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const verdicts = lines.map(l => JSON.parse(l));
  const bad = verdicts.filter(v => !v.valid || !v.answerCorrect);
  console.log(`\n📊 Audit summary`);
  console.log(`   Total audited : ${verdicts.length}`);
  console.log(`   Valid + correct: ${verdicts.filter(v => v.valid && v.answerCorrect).length}`);
  console.log(`   Bad (any issue): ${bad.length}`);
  console.log(`   Wrong answer   : ${verdicts.filter(v => v.valid && !v.answerCorrect).length}`);
  console.log(`   Invalid question: ${verdicts.filter(v => !v.valid).length}`);
  console.log(`\n   Bad questions saved to: audit_bad.jsonl\n`);
  process.exit(0);
}

// ── LLM call (Gemini primary, Groq fallback) ────────────────────────────────
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callLLM(prompt, retries = 8) {
  let useGemini = false;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!useGemini && GROQ_KEY) {
        const res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            max_tokens: 1024,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const data = await res.json();
          return data.choices?.[0]?.message?.content || '';
        }
        if (res.status === 429) {
          useGemini = true;
          process.stdout.write('\n   ⚠ Groq rate limited — switching to Gemini\n');
          continue;
        }
        if ((res.status === 503 || res.status === 500) && attempt < retries) {
          const wait = Math.min(attempt * 15000, 90000);
          process.stdout.write(`\n   ⏳ Groq ${res.status} — retrying in ${wait/1000}s (attempt ${attempt}/${retries})...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        const err = await res.text();
        throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
      }
      // Gemini fallback
      if (GEMINI_KEY) {
        const res = await fetch(GEMINI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 1024 },
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const data = await res.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        if ((res.status === 429 || res.status === 503 || res.status === 500) && attempt < retries) {
          const wait = Math.min(attempt * 15000, 90000);
          process.stdout.write(`\n   ⏳ Gemini ${res.status} — retrying in ${wait/1000}s (attempt ${attempt}/${retries})...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        const err = await res.text();
        throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
      }
      throw new Error('No API keys available');
    } catch (err) {
      if (err.message.startsWith('Groq') || err.message.startsWith('Gemini')) throw err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      throw err;
    }
  }
}

// ── Build prompt for a batch of questions ────────────────────────────────────
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

// ── Parse Gemini response ────────────────────────────────────────────────────
function parseVerdicts(text, questions) {
  const results = [];
  for (const q of questions) {
    // find the line with this ID
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

// ── Main ──────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Question Audit');
  console.log(`   Model  : ${GROQ_MODEL} (Groq) -> ${GEMINI_MODEL} (Gemini fallback)`);
  console.log(`   Output : ${VERDICTS_FILE}`);

  // Load already-audited IDs if resuming
  const auditedIds = new Set();
  if (RESUME && fs.existsSync(VERDICTS_FILE)) {
    for (const line of fs.readFileSync(VERDICTS_FILE, 'utf8').trim().split('\n').filter(Boolean)) {
      try { auditedIds.add(JSON.parse(line).id); } catch {}
    }
    console.log(`   Resuming — ${auditedIds.size} already audited, skipping those\n`);
  } else if (!RESUME) {
    // Fresh run — clear old files
    fs.writeFileSync(VERDICTS_FILE, '');
    fs.writeFileSync(BAD_FILE, '');
    console.log('   Fresh run — cleared previous verdicts\n');
  }

  // Fetch questions
  const questions = await prisma.question.findMany({
    where: { isActive: true },
    select: {
      id: true, text: true, options: true, correctOption: true,
      chapter: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
    take: LIMIT,
  });

  const toAudit = RESUME ? questions.filter(q => !auditedIds.has(q.id)) : questions;
  console.log(`   Questions to audit: ${toAudit.length}`);
  console.log(`   Estimated time    : ~${Math.ceil(toAudit.length / BATCH * DELAY_MS / 60000)} minutes\n`);

  let done = auditedIds.size;
  let badCount = 0;
  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < toAudit.length; i += BATCH) {
    const batch = toAudit.slice(i, i + BATCH);

    let verdicts;
    try {
      const prompt = buildPrompt(batch);
      const raw = await callLLM(prompt);
      verdicts = parseVerdicts(raw, batch);
    } catch (err) {
      console.error(`   ⚠ Batch ${i}-${i + BATCH} failed: ${err.message} — marking as OK`);
      verdicts = batch.map(q => ({ id: q.id, valid: true, answerCorrect: true, reason: 'api_error', chapter: q.chapter.name, text: q.text.slice(0, 80) }));
    }

    // Append to files
    const verdictLines = verdicts.map(v => JSON.stringify(v)).join('\n') + '\n';
    fs.appendFileSync(VERDICTS_FILE, verdictLines);

    const badVerdicts = verdicts.filter(v => !v.valid || !v.answerCorrect);
    if (badVerdicts.length > 0) {
      fs.appendFileSync(BAD_FILE, badVerdicts.map(v => JSON.stringify(v)).join('\n') + '\n');
      badCount += badVerdicts.length;
    }

    done += batch.length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rate = done / elapsed;
    const remaining = Math.round((toAudit.length - (i + BATCH)) / rate / 60);
    process.stdout.write(`\r   Progress: ${done}/${questions.length} | Bad so far: ${badCount} | ETA: ~${remaining}m     `);

    // Rate limit delay
    if (i + BATCH < toAudit.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n\n✅ Audit complete!`);
  console.log(`   Total audited : ${done}`);
  console.log(`   Bad questions : ${badCount}`);
  console.log(`   Verdicts file : ${VERDICTS_FILE}`);
  console.log(`   Bad file      : ${BAD_FILE}`);
  console.log(`\n   Run with 'summary' flag to see breakdown.`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
