#!/usr/bin/env node
// Generate questions for critical gap chapters using OpenRouter (free models)
// Usage: node scripts/generateGapQuestions.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const API_KEY = process.env.OPENROUTER_API_KEY;
const BASE_URL = 'https://openrouter.ai/api/v1';

if (!API_KEY) {
  console.error('No OPENROUTER_API_KEY found in .env');
  process.exit(1);
}

// Use free model - no rate limits
const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

const CHAPTERS = [
  { name: 'Gadyam', subject: 'Malayalam', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on Malayalam Gadyam (prose): Basheer, Thakazhi, O.V. Vijayan, characters, awards. LDC level.' },
  { name: 'Proverbs', subject: 'Malayalam', count: 100,
    prompt: 'Generate 10 MCQs about Kerala PSC exam proverbs. Each question asks about a common proverb and its meaning. Use English text for questions and options. Include proverbs about wisdom, family, education, work. LDC level exam format.' },
  { name: 'Human Body', subject: 'General Science', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on Human Body: organs, systems, diseases, nutrients. LDC level.' },
  { name: 'Padyam', subject: 'Malayalam', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on Malayalam Padyam (poetry): Changampuzha, Vailoppill, Sugathakumari. LDC level.' },
  { name: 'Important Appointments', subject: 'Current Affairs', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on Important Appointments 2024-2025: PM, CM, Governors, judges. LDC level.' },
  { name: 'Articles & Prepositions', subject: 'English', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on English Articles and Prepositions: a/an/the, common errors. LDC level.' },
  { name: 'National News', subject: 'Current Affairs', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on National News 2024-2025: policies, awards, events. LDC level.' },
  { name: 'Monthly Current Affairs', subject: 'Current Affairs', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on Current Affairs 2024-2025: events, economy, sports. LDC level.' },
  { name: 'Sahithyam', subject: 'Malayalam', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on Malayalam Sahithyam (literature): awards, movements, Jnanpith. LDC level.' },
  { name: 'Time & Work', subject: 'Mathematics', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on Time and Work: efficiency, pipes, wages. Mix difficulties. LDC level.' },
  { name: 'Simple & Compound Interest', subject: 'Mathematics', count: 100,
    prompt: 'Generate 10 Kerala PSC MCQs on Simple/Compound Interest: calculations, differences. Mix difficulties. LDC level.' }
];

const BATCH_SIZE = 10;
const BATCH_DELAY = 3000; // 3s between calls (no rate limit on free models)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOpenRouter(prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'HTTP-Referer': 'https://kerala-psc-app.vercel.app',
          'X-Title': 'Kerala PSC Question Generator'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 8000
        }),
        signal: AbortSignal.timeout(120000)
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429 && attempt < retries) {
          const wait = 10000 * attempt;
          console.log(`    ⏳ Rate limited, waiting ${wait/1000}s...`);
          await sleep(wait);
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 150)}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(5000 * attempt);
    }
  }
}

function extractJsonArray(txt) {
  txt = (txt || '').replace(/```json|```/g, '').trim();
  const a = txt.indexOf('['), b = txt.lastIndexOf(']');
  if (a < 0 || b < a) return [];
  try { const arr = JSON.parse(txt.slice(a, b + 1)); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

function toCSV(rows) {
  const lines = ['question,option_a,option_b,option_c,option_d,answer,explanation,difficulty'];
  for (const r of rows) {
    const esc = (s) => `"${(s || '').replace(/"/g, '""').replace(/\n/g, ' ').trim()}"`;
    const answerMap = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' };
    lines.push([
      esc(r.q), esc(r.opts?.[0]), esc(r.opts?.[1]), esc(r.opts?.[2]), esc(r.opts?.[3]),
      answerMap[r.a] || 'A', esc(r.exp || ''), r.d || 'MEDIUM'
    ].join(','));
  }
  return lines.join('\n');
}

function validateQuestion(r) {
  const q = (r.q || '').trim();
  const opts = r.opts || [];
  return q.length > 8 && opts.length === 4 && opts.every(o => o) &&
         Number.isInteger(r.a) && r.a >= 0 && r.a <= 3;
}

const outputDir = path.resolve(__dirname, '..', '..');

async function generateChapter(chapter) {
  console.log(`\n📝 Generating ${chapter.count} questions for: ${chapter.name} (${chapter.subject})`);

  // Skip chapters that already have enough questions
  const existingCSV = path.join(outputDir, `qb_${chapter.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`);
  if (fs.existsSync(existingCSV)) {
    const lines = fs.readFileSync(existingCSV, 'utf8').split('\n').filter(l => l.trim()).length - 1;
    if (lines >= chapter.count * 0.8) {
      console.log(`\n⏭️  Skipping ${chapter.name}: already have ${lines} questions`);
      return [];
    }
  }

  const allQuestions = [];
  const seenTexts = new Set();
  const batchesNeeded = Math.ceil(chapter.count / BATCH_SIZE);

  for (let batch = 1; batch <= batchesNeeded; batch++) {
    if (allQuestions.length >= chapter.count) break;

    const prompt = `${chapter.prompt}\n\nReturn JSON array of ${BATCH_SIZE} objects: [{"q":"question","opts":["a","b","c","d"],"a":0,"exp":"why","d":"MEDIUM"}]`;

    try {
      const response = await callOpenRouter(prompt);
      const questions = extractJsonArray(response);

      let added = 0;
      for (const r of questions) {
        if (allQuestions.length >= chapter.count) break;
        if (!validateQuestion(r)) continue;
        const text = (r.q || '').trim().toLowerCase();
        if (seenTexts.has(text)) continue;
        seenTexts.add(text);
        allQuestions.push(r);
        added++;
      }

      console.log(`    Batch ${batch}/${batchesNeeded}: +${added} (total: ${allQuestions.length})`);
    } catch (err) {
      console.error(`    ❌ Batch ${batch}/${batchesNeeded}: ${err.message}`);
    }

    if (batch < batchesNeeded) await sleep(BATCH_DELAY);
  }

  console.log(`    ✅ ${allQuestions.length} questions for ${chapter.name}`);
  return allQuestions;
}

async function main() {
  console.log('🚀 Kerala PSC Question Generator (OpenRouter Free Models)');
  console.log('='.repeat(55));

  let totalGenerated = 0;
  for (const chapter of CHAPTERS) {
    const questions = await generateChapter(chapter);

    if (questions.length > 0) {
      const csv = toCSV(questions);
      const filename = `qb_${chapter.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`;
      fs.writeFileSync(path.join(outputDir, filename), csv, 'utf8');
      console.log(`    📁 Saved: ${filename}`);
      totalGenerated += questions.length;
    }

    await sleep(2000);
  }

  console.log('\n' + '='.repeat(55));
  console.log(`✨ Total: ${totalGenerated} questions generated`);
  console.log('Run: node scripts/importQb.mjs');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
