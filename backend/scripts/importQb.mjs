import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const CHAPTER_KEYWORDS = {
  'Mensuration': ['area', 'perimeter', 'circumference', 'volume', 'rectangle', 'square', 'triangle', 'circle', 'cylinder', 'cone', 'sphere', 'cube', 'cuboid', 'diagonal', 'height', 'breadth', 'radius', 'diameter', 'hypotenuse'],
  'Number System': ['hcf', 'lcm', 'factor', 'prime', 'composite', 'divisible', 'remainder', 'fraction', 'decimal', 'surds', 'indices', 'square root', 'cube root', 'perfect square', 'perfect cube', 'rational', 'irrational', 'natural number', 'whole number', 'integer'],
  'Percentages': ['percent', 'percentage', 'successive', 'election', 'votes', 'population', 'depreciation', 'increased by', 'decreased by', 'convert.*ratio', 'equivalent.*percent'],
  'Profit & Loss': ['profit', 'loss', 'cost price', 'selling price', 'cp', 'sp', 'marked price', 'discount', 'gain', 'sold for', 'bought for', 'articles', 'deficit', 'surplus'],
  'Simple & Compound Interest': ['simple interest', 'compound interest', 'principal', 'rate of interest', 'amount', 'installment', 'effective rate'],
  'Time & Distance': ['speed', 'km/h', 'm/s', 'train', 'boat', 'stream', 'average speed', 'relative speed', 'upstream', 'downstream'],
  'Time & Work': ['work', 'days', 'pipes', 'cistern', 'efficiency', 'wages', 'job'],
  'Algebra': ['equation', 'polynomial', 'factorize', 'factorisation', 'simplify', 'expression', 'variable', 'x =', 'y =', 'quadratic', 'linear'],
};

function detectChapter(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const [chapter, keywords] of Object.entries(CHAPTER_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = chapter;
    }
  }
  return best || 'Mensuration';
}

function tokenize(s) {
  if (!s) return [];
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2);
}

const STOP = new Set(['the','a','an','of','in','on','at','to','for','and','or','is','are','was','were','be','been','which','what','who','when','where','how','this','that','with','from','by','as','it','its','not','no','can','will','would','should','may','might','must','do','does','did','has','have','had','find','given','following','each','per','one','two','three','four','five','six','seven','eight','nine','ten']);

function matchConcept(text, nodes) {
  const qTokens = new Set(tokenize(text).filter(t => !STOP.has(t)));
  if (qTokens.size === 0) return null;

  let bestNode = null;
  let bestScore = 0;

  for (const node of nodes) {
    const nodeTokens = new Set(tokenize(node.nameEnglish));
    let score = 0;
    for (const t of nodeTokens) {
      if (qTokens.has(t)) score += t.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }
  return bestScore >= 4 ? bestNode : null;
}

const LETTER_TO_IDX = { A: 0, B: 1, C: 2, D: 3 };

function shuffleOptions(options, correctIdx) {
  const indexed = options.map((opt, i) => ({ opt, i }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }
  const newOptions = indexed.map(x => x.opt);
  const newCorrect = indexed.findIndex(x => x.i === correctIdx);
  return { options: newOptions, correctOption: newCorrect };
}

async function main() {
  const filePath = path.resolve(__dirname, '../../qb.xlsx');
  console.log('Reading:', filePath);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  console.log('Total rows in file:', rows.length);

  const chapters = await prisma.chapter.findMany({
    include: { subject: { include: { exam: true } } }
  });
  const chapterMap = new Map();
  for (const c of chapters) {
    const key = `${c.name}|${c.subject.exam.name}`;
    chapterMap.set(key, c);
  }

  const mathChapters = chapters.filter(c => c.subject.name === 'Mathematics');
  console.log('Math chapters available:', mathChapters.map(c => c.name + ' (' + c.subject.exam.name + ')').join(', '));

  const taxonomyNodes = await prisma.taxonomyNode.findMany({
    select: { id: true, nameEnglish: true, level: true }
  });
  console.log('Taxonomy nodes loaded:', taxonomyNodes.length);

  const existingTexts = new Set(
    (await prisma.question.findMany({ select: { text: true } }))
      .map(q => q.text.toLowerCase().trim())
  );
  console.log('Existing questions for dedup:', existingTexts.size);

  let imported = 0, skipped = 0, dupes = 0, conceptAssigned = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = String(row.question || '').trim();

    if (!text || text === 'question' || text.length < 10) {
      skipped++;
      continue;
    }

    const optionA = String(row.option_a || '').trim();
    const optionB = String(row.option_b || '').trim();
    const optionC = String(row.option_c || '').trim();
    const optionD = String(row.option_d || '').trim();

    if (!optionA || !optionB || !optionC || !optionD) {
      errors.push(`Row ${i + 2}: missing options`);
      skipped++;
      continue;
    }

    const answer = (row.answer || '').trim().toUpperCase();
    const correctOption = LETTER_TO_IDX[answer];
    if (correctOption === undefined) {
      errors.push(`Row ${i + 2}: invalid answer "${row.answer}"`);
      skipped++;
      continue;
    }

    const explanation = String(row.explanation || '').trim() || null;
    let difficulty = String(row.difficulty || 'MEDIUM').trim().toUpperCase();
    if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) difficulty = 'MEDIUM';

    if (existingTexts.has(text.toLowerCase().trim())) {
      dupes++;
      continue;
    }

    const chapterName = detectChapter(text);
    const mathChapter = mathChapters.find(c => c.name === chapterName && c.subject.exam.name === 'LDC (Lower Division Clerk)');
    if (!mathChapter) {
      errors.push(`Row ${i + 2}: chapter "${chapterName}" not found`);
      skipped++;
      continue;
    }

    const conceptNode = matchConcept(text, taxonomyNodes);
    const conceptId = conceptNode ? conceptNode.id : null;
    if (conceptId) conceptAssigned++;

    try {
      const { options: shuffledOpts, correctOption: shuffledCorrect } = shuffleOptions(
        [optionA, optionB, optionC, optionD], correctOption
      );
      await prisma.question.create({
        data: {
          chapterId: mathChapter.id,
          conceptId,
          text,
          options: shuffledOpts,
          correctOption: shuffledCorrect,
          explanation,
          difficulty,
          tags: ['qb-import', `chapter:${chapterName}`],
          isActive: true,
        }
      });
      existingTexts.add(text.toLowerCase().trim());
      imported++;
      if (imported % 50 === 0) console.log(`  Progress: ${imported} imported...`);
    } catch (e) {
      errors.push(`Row ${i + 2}: ${e.message}`);
      skipped++;
    }
  }

  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Duplicates: ${dupes}`);
  console.log(`Concepts assigned: ${conceptAssigned}`);
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    errors.slice(0, 20).forEach(e => console.log('  ' + e));
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
