// Generic importer for a single JSONL question file (clean UTF-8).
// Usage: node scripts/importJsonl.mjs <path-to.jsonl> [sourceTag]
// Each record: { question, option_A, option_B, option_C, option_D, answer, explanation?, post_title?, exam_type? }
// Only rows with all 4 non-corrupt options + an A-D answer are imported.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  detectChapter,
  recoverOptions,
  LETTER_TO_IDX,
  normalizeText,
  loadChapterNameMap,
  ensureUncategorizedChapter,
  makeConceptFinder,
  loadExistingNormalizedTexts,
  clearTag,
} from './lib/pscMapping.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not found'); process.exit(1); }

const FILE = process.argv[2] || 'C:/Users/saran/Desktop/scrap/kpsc_questions.jsonl';
const SOURCE_TAG = process.argv[3] || path.basename(FILE, '.jsonl').replace(/[^a-z0-9]/gi, '-').toLowerCase();

// Corrupted text: PUA (U+E000–U+F8FF), replacement char, or Latin-1 (U+0080–U+00FF).
const isBad = (s) => {
  for (const ch of (s || '')) {
    const c = ch.codePointAt(0);
    if ((c >= 0xe000 && c <= 0xf8ff) || c === 0xfffd || (c >= 0x80 && c <= 0xff)) return true;
  }
  return false;
};

const prisma = new PrismaClient();

async function main() {
  const chapterByName = await loadChapterNameMap(prisma);
  const uncategorizedId = await ensureUncategorizedChapter(prisma);
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, aliases: true } });
  const findConcept = makeConceptFinder(nodes);

  // Idempotent: clear previous import for this tag (FK-safe), then load existing
  await clearTag(prisma, SOURCE_TAG);
  const existing = await loadExistingNormalizedTexts(prisma);

  const raw = fs.readFileSync(FILE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const seenTexts = new Set();
  let total = 0, imported = 0, droppedQ = 0, droppedOpts = 0, droppedAns = 0, droppedGarble = 0, dupes = 0, mapped = 0, uncat = 0;
  const toCreate = [];

  for (const line of raw) {
    total++;
    let d;
    try { d = JSON.parse(line); } catch { droppedGarble++; continue; }
    const qText = (d.question || '').trim();
    if (!qText) { droppedQ++; continue; }
    const rawOpts = [(d.option_A || '').trim(), (d.option_B || '').trim(), (d.option_C || '').trim(), (d.option_D || '').trim()];
    const opts = recoverOptions(rawOpts);
    if (opts.filter((o) => o).length < 4) { droppedOpts++; continue; }
    const answer = (d.answer || '').trim().toUpperCase();
    if (LETTER_TO_IDX[answer] === undefined) { droppedAns++; continue; }
    if (isBad(opts.join(' ')) || isBad(qText)) { droppedGarble++; continue; }

    const norm = normalizeText(qText);
    if (!norm || seenTexts.has(norm) || existing.has(norm)) { dupes++; continue; }
    seenTexts.add(norm);

    const explanation = d.explanation || '';
    const expClean = explanation && !isBad(explanation) ? explanation.trim() : undefined;
    const blob = qText + ' ' + opts.join(' ');
    const chapterName = detectChapter(blob);
    let chapterId = chapterName ? chapterByName(chapterName) : null;
    if (!chapterId) { chapterId = uncategorizedId; uncat++; } else mapped++;

    let conceptId = chapterName ? findConcept(chapterName) : null;
    if (conceptId === null) conceptId = findConcept(blob);

    const tags = [SOURCE_TAG];
    const post = d.post_title || '';
    if (post && !isBad(post)) tags.push(`src:${post.slice(0, 80)}`);
    const etype = d.exam_type || '';
    if (etype && !isBad(etype)) tags.push(`type:${etype.slice(0, 40)}`);

    imported++;
    toCreate.push({
      chapterId, conceptId, text: qText, options: opts,
      correctOption: LETTER_TO_IDX[answer], explanation: expClean,
      difficulty: 'MEDIUM', tags, isActive: true,
    });
  }

  const BATCH = 500;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    await prisma.question.createMany({ data: toCreate.slice(i, i + BATCH) });
  }

  const demo = await prisma.user.findUnique({ where: { email: 'demo@student.com' } });
  if (demo) {
    const ids = [...new Set(toCreate.map((q) => q.chapterId))];
    for (const cid of ids) {
      await prisma.userChapter.upsert({
        where: { userId_chapterId: { userId: demo.id, chapterId: cid } },
        update: { isLearned: true },
        create: { userId: demo.id, chapterId: cid, isLearned: true },
      });
    }
  }

  const finalCount = await prisma.question.count();
  console.log(JSON.stringify({
    source: FILE, tag: SOURCE_TAG, total_records: total, imported,
    dropped_empty_question: droppedQ, dropped_missing_options: droppedOpts,
    dropped_bad_answer: droppedAns, dropped_garbled: droppedGarble,
    duplicates_skipped: dupes, mapped_to_subject_chapter: mapped, uncategorized: uncat,
    with_concept: toCreate.filter((q) => q.conceptId !== null).length,
    demo_learned_chapters: demo ? [...new Set(toCreate.map((q) => q.chapterId))].length : 0,
    final_question_count: finalCount,
  }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
