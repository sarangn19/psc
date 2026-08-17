// Import quiz-ready questions from the scraped PSC corpus into the app DB.
// Source: C:\Users\saran\Documents\scrap\psc_scraper\exports\questions.csv
// Strategy: keep only quiz-ready rows (valid A-D answer + all 4 options),
// dedupe by normalized text, map subject -> chapter, best-effort conceptId.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  parseCsv,
  detectChapter,
  recoverOptions,
  LETTER_TO_IDX,
  isBad,
  normalizeText,
  loadChapterNameMap,
  ensureUncategorizedChapter,
  makeConceptFinder,
  clearTag,
} from './lib/pscMapping.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── env ──
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const prisma = new PrismaClient();

const CSV = 'C:/Users/saran/Documents/scrap/psc_scraper/exports/questions.csv';
const SOURCE_TAG = 'corpus';

async function main() {
  const chapterByName = await loadChapterNameMap(prisma);
  const uncategorizedId = await ensureUncategorizedChapter(prisma);

  // Taxonomy nodes for concept mapping
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, aliases: true } });
  const findConcept = makeConceptFinder(nodes);

  // Read + parse CSV
  const text = fs.readFileSync(CSV, 'utf8');
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim());
  const idx = {};
  header.forEach((h, i) => (idx[h] = i));
  const dataRows = rows.slice(1);

  // Idempotent: clear previous import (FK-safe)
  await clearTag(prisma, SOURCE_TAG);

  const existing = await (async () => {
    const all = await prisma.question.findMany({ select: { text: true } });
    return new Set(all.map((q) => normalizeText(q.text)).filter(Boolean));
  })();

  const seenTexts = new Set();
  let total = 0, quizReady = 0, dupes = 0, mapped = 0, uncat = 0;
  const toCreate = [];

  for (const r of dataRows) {
    total++;
    const get = (k) => (idx[k] !== undefined && r[idx[k]] !== undefined ? r[idx[k]] : '');
    const rawOpts = [get('option_a'), get('option_b'), get('option_c'), get('option_d')].map((o) => (o || '').trim());
    const opts = recoverOptions(rawOpts);
    const optCount = opts.filter((o) => o).length;
    const answer = (get('answer') || '').trim().toUpperCase();
    const hasAnswer = LETTER_TO_IDX[answer] !== undefined;
    if (!hasAnswer || optCount < 4) continue; // quiz-ready only

    const qText = get('question');
    if (isBad(opts.join(' ')) || isBad(qText)) { dupes++; continue; }
    const norm = normalizeText(qText);
    if (!norm || seenTexts.has(norm) || existing.has(norm)) { dupes++; continue; }
    seenTexts.add(norm);

    const chapterName = detectChapter(qText + ' ' + opts.join(' '));
    let chapterId = chapterName ? chapterByName(chapterName) : null;
    if (!chapterId) { chapterId = uncategorizedId; uncat++; }
    else mapped++;

    let conceptId = chapterName ? findConcept(chapterName) : null;
    if (conceptId === null) conceptId = findConcept(qText + ' ' + opts.join(' '));
    const tags = [SOURCE_TAG];
    const examName = get('exam_name');
    if (examName) tags.push(`exam:${examName.slice(0, 60)}`);
    const year = get('year');
    if (year) tags.push(`year:${year}`);

    quizReady++;
    toCreate.push({
      chapterId,
      conceptId,
      text: qText,
      options: opts,
      correctOption: LETTER_TO_IDX[answer],
      difficulty: 'MEDIUM',
      tags,
      isActive: true,
    });
  }

  // Batch insert
  const BATCH = 500;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const slice = toCreate.slice(i, i + BATCH);
    await prisma.question.createMany({ data: slice });
  }

  // Mark imported chapters as learned for demo user so they appear in default flow
  const demo = await prisma.user.findUnique({ where: { email: 'demo@student.com' } });
  if (demo) {
    const importedChapterIds = [...new Set(toCreate.map((q) => q.chapterId))];
    for (const cid of importedChapterIds) {
      await prisma.userChapter.upsert({
        where: { userId_chapterId: { userId: demo.id, chapterId: cid } },
        update: { isLearned: true },
        create: { userId: demo.id, chapterId: cid, isLearned: true },
      });
    }
  }

  const finalCount = await prisma.question.count();
  console.log(JSON.stringify({
    total_rows: total,
    quiz_ready_imported: quizReady,
    duplicates_skipped: dupes,
    mapped_to_subject_chapter: mapped,
    uncategorized: uncat,
    with_concept: toCreate.filter((q) => q.conceptId !== null).length,
    demo_learned_chapters: demo ? [...new Set(toCreate.map((q) => q.chapterId))].length : 0,
    final_question_count: finalCount,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
