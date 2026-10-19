/**
 * applyAmbiguousFix2.mjs — resolve the 128 AMBIGUOUS leftovers from eng_chapter_fix_plan.json
 * (approved by user). Dry-run default; --apply executes; separate rollback file.
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
const PLAN1 = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'eng_chapter_fix_plan.json'), 'utf8'));
const OUT_PLAN = path.resolve(__dirname, 'eng_ambiguous_fix_plan.json');
const OUT_RB = path.resolve(__dirname, 'eng_ambiguous_fix_rollback.json');

async function main() {
  const prisma = new PrismaClient();
  const ambiguous = PLAN1.ambiguous;
  const ids = ambiguous.map((a) => a.id);
  const questions = await prisma.question.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, text: true, chapterId: true, chapter: { select: { id: true, name: true, subject: { select: { name: true, exam: { select: { name: true } } } } } } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const attG = await prisma.questionAttempt.groupBy({ by: ['questionId'], where: { questionId: { in: ids } }, _count: { _all: true } });
  const att = new Map(attG.map((g) => [g.questionId, g._count._all]));

  // chapter lookup per exam: name -> {id, subject}
  const examCache = new Map();
  async function examChapters(exam) {
    if (!examCache.has(exam)) {
      examCache.set(exam, await prisma.chapter.findMany({ where: { subject: { exam: { name: exam } } }, select: { id: true, name: true, subject: { select: { name: true } } } }));
    }
    return examCache.get(exam);
  }

  const moves = [], deactivations = [], kept = [], unresolved = [];
  for (const a of ambiguous) {
    const q = byId.get(a.id);
    if (!q) continue; // already inactive
    const base = { id: a.id, exam: a.exam, fromChapterId: q.chapterId, fromChapterName: q.chapter.name, attempts: att.get(a.id) || 0, targetTopic: a.targetTopic || '', text: q.text.slice(0, 100) };
    const chs = await examChapters(a.exam);
    const byName = (n) => chs.find((c) => c.name === n);

    if (a.matchNames?.length) {
      const names = a.matchNames;
      let target = null, action = null;
      if (names.includes('Geography of Kerala') && names.includes('Indian Geography')) {
        target = byName(/kerala/i.test(q.text) ? 'Geography of Kerala' : 'Indian Geography'); action = 'move';
      } else if (names.includes('Kerala History') && names.includes('Indian History')) {
        if (/resident|resume format/i.test(q.text)) { action = 'deactivate'; }
        else if (/novel|poem/i.test(q.text)) { action = 'keep'; }
      } else if (names.includes('Percentages') && names.includes('Algebra')) {
        target = byName(/percent/i.test(q.text) ? 'Percentages' : 'Algebra'); action = 'move';
      } else {
        // prefer unique English-subject match; tie-break by preposition text
        const eng = names.map(byName).filter((c) => c && c.subject.name === 'English');
        if (/preposition/i.test(q.text) && eng.some((c) => c.name === 'Articles & Prepositions')) target = byName('Articles & Prepositions');
        else if (eng.length === 1) target = eng[0];
        if (target) action = 'move';
      }
      if (action === 'move' && target) moves.push({ ...base, toChapterId: target.id, toChapterName: target.name, via: 'ambiguous-resolution' });
      else if (action === 'deactivate') deactivations.push({ ...base, why: 'non-English in wrong chapter' });
      else if (action === 'keep') kept.push({ ...base, why: 'literature, no better chapter' });
      else unresolved.push({ ...base, matchNames: names });
    } else {
      // unclear topic: text-based split
      const textEnglish = /synonym|antonym|tense|grammar|vocabular|idiom|proverb|preposition|article|spell|punctuat|comprehens|reading|passage|cloze|blank|sentence|voice|speech|narrat|clause|verb|pronoun|adverb|conjunction|adjective|question tag|word|literature|poem|novel|author|literary|writer|story|drama|painting|phrase|passive|active|english|verbal|language/i.test(q.text.slice(0, 200));
      const keepOverride = /vox populi|santiago|brutus jones|tintin/i.test(q.text);
      if (keepOverride || (textEnglish && !/niti aayog/i.test(q.text))) kept.push({ ...base, why: 'English/reading content' });
      else deactivations.push({ ...base, why: 'non-English GK/subject in English chapter' });
    }
  }

  const w = (arr) => `${arr.length} (attempts: ${arr.filter((x) => x.attempts > 0).length})`;
  console.log(`AMBIGUOUS pass-2 PLAN (of ${ambiguous.length}):
  MOVE        : ${w(moves)}
  DEACTIVATE  : ${w(deactivations)}
  KEEP        : ${kept.length}
  UNRESOLVED  : ${unresolved.length}`);
  for (const m of moves.slice(0, 8)) console.log(`  MOVE ${m.fromChapterName} -> "${m.toChapterName}" :: ${m.text}`);
  for (const d of deactivations.slice(0, 8)) console.log(`  DEACT ${d.why} :: ${d.text}`);
  for (const k of kept.slice(0, 6)) console.log(`  KEEP  tt="${k.targetTopic}" :: ${k.text}`);
  for (const u of unresolved.slice(0, 8)) console.log(`  ??    [${(u.matchNames || []).join(' / ')}] :: ${u.text}`);

  fs.writeFileSync(OUT_PLAN, JSON.stringify({ generatedAt: new Date().toISOString(), moves, deactivations, kept, unresolved }, null, 2));
  console.log(`Plan: ${OUT_PLAN}`);
  if (!APPLY) { console.log('DRY-RUN — nothing changed.'); await prisma.$disconnect(); return; }

  const rb = { appliedAt: new Date().toISOString(), moved: [], deactivated: [] };
  for (const m of moves) { await prisma.question.update({ where: { id: m.id }, data: { chapterId: m.toChapterId } }); rb.moved.push({ id: m.id, from: m.fromChapterId, to: m.toChapterId }); }
  for (const d of deactivations) { await prisma.question.update({ where: { id: d.id }, data: { isActive: false } }); rb.deactivated.push({ id: d.id }); }
  fs.writeFileSync(OUT_RB, JSON.stringify(rb, null, 2));
  console.log(`APPLIED: moved=${moves.length} deactivated=${deactivations.length} | rollback: ${OUT_RB}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
