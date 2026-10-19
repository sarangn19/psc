/**
 * applyAmbiguousFix3.mjs — resolve the 20 AMBIGUOUS leftovers from
 * eng_chapter_fix_plan_bankingssc.json (approved by user).
 *
 * Dry-run by default; --apply executes; writes its own plan + rollback files.
 * Decisions are an explicit id -> action table (not heuristics) so every change
 * is auditable against the question text/options.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const APPLY = process.argv.includes('--apply');
const PLAN_IN = path.resolve(__dirname, 'eng_chapter_fix_plan_bankingssc.json');
const OUT_PLAN = path.resolve(__dirname, 'eng_ambiguous_fix_plan_bankingssc.json');
const OUT_RB = path.resolve(__dirname, 'eng_ambiguous_fix_rollback_bankingssc.json');

// --- decision table -------------------------------------------------------
// 'KEEP'    = already in the right chapter; the audit LLM mis-flagged it
// '<name>'  = move to that chapter name within the same exam
const DECISIONS = {
  // Banking Exams (IBPS/SBI): exam has only 7 subject-named chapters.
  // These three are sentence-discrimination items (options are near-identical
  // sentences) — they are English content, and "English Language" is the only
  // English chapter available, so leaving them is correct.
  'cmtsimqcx016l11hql8ogj2hh': 'KEEP', // "account will be closed after six months of inactivity" — variants differ by activity/inactivity
  'cmtsimqcx016n11hqe4g3aq8b': 'KEEP', // "loans at a low interest rate" — variants differ by low/high
  'cmtsimqcx016p11hqqvjsx6iq': 'KEEP', // "good credit history" — variants differ by good/bad/no
  // Same exam: genuine banking-terminology MCQs, no English topic chapter needed.
  'cmtsimr5f019111hq8f7989bn': 'Banking Awareness', // "process of checking the income of a customer" -> Income Verification
  'cmtsimrcb019311hqlhvhdepf': 'Banking Awareness', // "The bank's ____ is Rs. 500 million" -> capital
  'cmtsimrcb019411hq33rd4d3b': 'Banking Awareness', // "The customer's ____ was debited" -> account

  // Exams with topic-level Banking Awareness chapters: all are banking facts.
  'cmttnmtm501brf4hieol59r8t': 'Banking Awareness (Banking Terms)', // short-term loan time period
  'cmttnmtm501bsf4hix41ip7kk': 'Banking Awareness (Banking Terms)', // risk management technique -> Hedging
  'cmttnnvnj02kof4hiig5x7pvk': 'Banking Awareness (Banking Terms)', // credit score measures credit history
  'cmttnnz0p02oef4hi7be8l46x': 'Banking Awareness (Banking Terms)', // checking income of a customer
  'cmttnp9b504bnf4hiksw1pnd7': 'Banking Awareness (Banking Terms)', // checking income of a customer
  'cmttnqjfe05iif4hiiy8kap1l': 'Banking Awareness (Banking Terms)', // short-term loan time period
  'cmttnqjfe05ijf4hikgevkj4v': 'Banking Awareness (Banking Terms)', // risk management technique
  'cmttnrzo20762f4hi9kjzwcsx': 'Banking Awareness (Banking Terms)', // checking income of a customer
  'cmttnxlm900il1ejyk43yveo1': 'Banking Awareness (Banking Terms)', // checking credentials of a customer
  'cmttnxlm900in1ejytvw1sozt': 'Banking Awareness (Banking Terms)', // short-term loan time period
  'cmttnxlma00iw1ejybkon4rca': 'Banking Awareness (Banking Terms)', // long-term loan time period

  // English grammar: one blank, not two — so Single Fillers, not Double Fillers.
  'cmttnqbne05atf4himwhyit2g': 'Fill in the Blanks (Single)', // "Unless you ___ the instructions"

  // SSC CGL: genuine English vocabulary matching; already in the right chapter.
  'cmv9d96ao017u503of0diandz': 'KEEP', // Benevolent/Abundant/Reluctant
  'cmv9d96ao017v503o7uek71kn': 'KEEP', // Concise/Fragile/Inevitable
};

async function main() {
  const prisma = new PrismaClient();
  const plan = JSON.parse(fs.readFileSync(PLAN_IN, 'utf8'));
  const ambiguous = plan.ambiguous;
  const ids = ambiguous.map((a) => a.id);

  const missing = ids.filter((id) => !DECISIONS[id]);
  const extra = Object.keys(DECISIONS).filter((id) => !ids.includes(id));
  if (missing.length || extra.length) {
    console.error(`DECISION TABLE MISMATCH — missing ${missing.length}, stale ${extra.length}`);
    if (missing.length) console.error('  missing:', missing.join(', '));
    if (extra.length) console.error('  stale  :', extra.join(', '));
    process.exit(1);
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, text: true, chapterId: true, chapter: { select: { id: true, name: true, subject: { select: { name: true, exam: { select: { name: true } } } } } } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const attG = await prisma.questionAttempt.groupBy({ by: ['questionId'], where: { questionId: { in: ids } }, _count: { _all: true } });
  const att = new Map(attG.map((g) => [g.questionId, g._count._all]));

  const examCache = new Map();
  async function examChapters(exam) {
    if (!examCache.has(exam)) {
      examCache.set(exam, await prisma.chapter.findMany({ where: { subject: { exam: { name: exam } } }, select: { id: true, name: true, subject: { select: { name: true } } } }));
    }
    return examCache.get(exam);
  }

  const moves = [], kept = [], problems = [];
  for (const a of ambiguous) {
    const q = byId.get(a.id);
    if (!q) { problems.push({ id: a.id, why: 'not found / already inactive' }); continue; }
    const decision = DECISIONS[a.id];
    const base = {
      id: a.id, exam: a.exam, fromChapterId: q.chapterId, fromChapterName: q.chapter.name,
      attempts: att.get(a.id) || 0, text: q.text.slice(0, 120),
    };
    if (decision === 'KEEP') {
      kept.push({ ...base, why: 'already in correct chapter (audit LLM mis-flag)' });
      continue;
    }
    const chs = await examChapters(a.exam);
    const hits = chs.filter((c) => c.name === decision);
    if (hits.length !== 1) {
      problems.push({ id: a.id, why: `target "${decision}" matched ${hits.length} chapters in ${a.exam}` });
      continue;
    }
    if (hits[0].id === q.chapterId) {
      problems.push({ id: a.id, why: `target "${decision}" is the current chapter` });
      continue;
    }
    moves.push({ ...base, toChapterId: hits[0].id, toChapterName: hits[0].name, toSubject: hits[0].subject.name });
  }

  console.log(`AMBIGUOUS pass-2 PLAN (of ${ambiguous.length}):
  MOVE : ${moves.length} (attempts: ${moves.filter((x) => x.attempts > 0).length})
  KEEP : ${kept.length}
  PROBLEMS: ${problems.length}`);
  console.log('\n-- MOVE --');
  for (const m of moves) console.log(`  [${m.exam}] ${m.fromChapterName} -> "${m.toChapterName}" :: ${m.text}`);
  console.log('\n-- KEEP --');
  for (const k of kept) console.log(`  [${k.exam}] ${k.fromChapterName} :: ${k.text}`);
  if (problems.length) { console.log('\n-- PROBLEMS --'); for (const p of problems) console.log(`  #${p.id} ${p.why}`); }

  fs.writeFileSync(OUT_PLAN, JSON.stringify({ generatedAt: new Date().toISOString(), moves, kept, problems }, null, 2));
  console.log(`\nPlan: ${OUT_PLAN}`);

  if (!APPLY) { console.log('DRY-RUN — nothing changed. Re-run with --apply to execute.'); await prisma.$disconnect(); return; }
  if (problems.length) { console.error('Refusing to apply while PROBLEMS remain.'); process.exit(1); }

  const rb = { appliedAt: new Date().toISOString(), moved: [] };
  for (const m of moves) {
    await prisma.question.update({ where: { id: m.id }, data: { chapterId: m.toChapterId } });
    rb.moved.push({ id: m.id, from: m.fromChapterId, to: m.toChapterId });
  }
  fs.writeFileSync(OUT_RB, JSON.stringify(rb, null, 2));
  console.log(`APPLIED: moved=${moves.length} kept=${kept.length} | rollback: ${OUT_RB}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
