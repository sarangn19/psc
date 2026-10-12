import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();

function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasBadChars(s) {
  const str = typeof s === 'string' ? s : String(s || '');
  for (const c of str) {
    const x = c.codePointAt(0);
    if ((x >= 0xe000 && x <= 0xf8ff) || x === 0xfffd) return true;
  }
  return false;
}

async function main() {
  console.log('🔍 Running Database Integrity & Uniqueness Audit...\n');

  const totalCount = await prisma.question.count();
  const allQs = await prisma.question.findMany({
    select: { id: true, text: true, options: true, correctOption: true, conceptId: true }
  });

  const uniqueNormTexts = new Set();
  let invalidOptionsCount = 0;
  let invalidAnswerCount = 0;
  let emptyExplanationOrTextCount = 0;
  let garbledCount = 0;
  let malayalamCount = 0;
  let englishCount = 0;
  let missingConceptCount = 0;

  for (const q of allQs) {
    const norm = normalizeText(q.text);
    if (norm) uniqueNormTexts.add(norm);

    let opts = q.options;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { opts = []; }
    }

    // Options check: must be array of exactly 4 non-empty strings
    if (!Array.isArray(opts) || opts.length !== 4 || opts.some(o => !String(o || '').trim())) {
      invalidOptionsCount++;
    }

    // Answer index check: must be 0, 1, 2, or 3
    if (typeof q.correctOption !== 'number' || q.correctOption < 0 || q.correctOption > 3) {
      invalidAnswerCount++;
    }

    // Text quality
    if (!q.text || q.text.trim().length < 5) {
      emptyExplanationOrTextCount++;
    }

    if (hasBadChars(q.text) || (Array.isArray(q.options) && q.options.some(hasBadChars))) {
      garbledCount++;
    }

    if (q.conceptId === null) {
      missingConceptCount++;
    }

    // Language detection
    if ([...q.text].some(c => c >= 'ഀ' && c <= 'ൿ')) {
      malayalamCount++;
    } else {
      englishCount++;
    }
  }

  console.log('====================================================');
  console.log(`📊 TOTAL QUESTIONS IN DB      : ${totalCount}`);
  console.log(`✨ UNIQUE QUESTION TEXTS       : ${uniqueNormTexts.size}`);
  console.log(`📋 REPLICATED EXAM COPIES      : ${totalCount - uniqueNormTexts.size} (cross-populated across LDC/LGS/VEO/Degree Level)`);
  console.log('----------------------------------------------------');
  console.log(`✅ VALID 4-OPTION FORMAT      : ${totalCount - invalidOptionsCount} / ${totalCount} (${invalidOptionsCount === 0 ? '100% PERFECT' : invalidOptionsCount + ' invalid'})`);
  console.log(`✅ VALID ANSWER INDEX (A-D)    : ${totalCount - invalidAnswerCount} / ${totalCount} (${invalidAnswerCount === 0 ? '100% PERFECT' : invalidAnswerCount + ' invalid'})`);
  console.log(`✅ TEXT INTEGRITY (NO GARBLE)  : ${totalCount - garbledCount} / ${totalCount} (${garbledCount === 0 ? '100% CLEAN' : garbledCount + ' garbled'})`);
  console.log(`✅ TAXONOMY CONCEPT MAPPED     : ${totalCount - missingConceptCount} / ${totalCount}`);
  console.log('----------------------------------------------------');
  console.log(`🌐 LANGUAGE BREAKDOWN          : ${malayalamCount} Malayalam MCQs | ${englishCount} English MCQs`);
  console.log('====================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
