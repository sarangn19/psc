/**
 * planEngChapterFix.mjs — build (and optionally apply) the PSC English-chapter fix plan
 * from eng_alignment_bad.jsonl verdicts.
 *
 * Usage:
 *   node backend/scripts/planEngChapterFix.mjs           # dry-run: prints summary + samples, writes plan JSON
 *   node backend/scripts/planEngChapterFix.mjs --apply   # applies MOVE + DEACTIVATE, writes rollback JSON
 *
 * Categories per misaligned question:
 *   MOVE        — unique target chapter found in same exam (via concept path / LLM targetTopic / reason)
 *   DEACTIVATE  — non-English content and no matching chapter anywhere in the exam
 *   LEFT        — English-adjacent content but no better chapter exists (kept in place, reported)
 *   AMBIGUOUS   — multiple candidate chapters, unclear (kept in place, reported)
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
const TAG = process.argv.find((a) => a.startsWith('tag='))?.split('=')[1] || '';

const BAD_FILE = path.resolve(__dirname, 'eng_alignment_bad.jsonl');
const PLAN_FILE = path.resolve(__dirname, `eng_chapter_fix_plan${TAG ? '_' + TAG : ''}.json`);
const ROLLBACK_FILE = path.resolve(__dirname, `eng_chapter_fix_rollback${TAG ? '_' + TAG : ''}.json`);

const STOP = new Set(['and', 'of', 'the', 'in', 'a', 'an', 'for', 'to', 'on', 'or', 'at', 'by', 'is', 'are', 'with', 'from']);
function tokens(name) {
  return [...new Set(
    String(name).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter((w) => w && !STOP.has(w))
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  )];
}
function cleanTopic(s) {
  if (!s) return '';
  return String(s)
    .split(/\s+Q\d+\b|\s*Qn topic:|\s*\[ID:/)[0]
    .split('|')[0]
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-zA-Z &'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const ENGLISHY = /synonym|antonym|tense|grammar|vocabular|idiom|proverb|preposition|article|spell|punctuat|comprehens|reading|passage|cloze|blank|sentence|voice|speech|narrat|clause|verb|pronoun|adverb|conjunction|adjective|part of speech|question tag|word|literature|poem|novel|author|literary|writer|story|drama|painting|condition|error|improv|rearrang|fill|paragraph|phrase|direct and indirect|passive|active|modals?|english|verbal|linguis|elT|language|syntax|morpholog|phonolog|semantics|discourse|corpus|bilingual|dialect|accent|orthograph|lexicon|teaching|education|writing/i;
const isEnglishy = (s) => ENGLISHY.test(s || '');

// Text-derived topics. The LLM targetTopic field is noisy (generation artifacts
// leak into it), so classify from the question text itself first. Ordered:
// first match wins.
const TEXT_TOPICS = [
  { re: /\bsimple interest\b|\bcompound interest\b|\brate of interest\b|\binterest paid\b|\binterest earned\b|\bper annum\b|\bfixed deposit\b|\bborrow(?:ed|s)?\b/i, topic: 'Simple Interest', subject: 'Quantitative Aptitude', want: /simple.*compound interest|compound interest|simple interest/i, prefer: [/simple.*compound interest/i] },
  { re: /\boffers? a discount of \d+\s*%|\bdiscount of \d+\s*%|\bdiscount\b/i, topic: 'Discount', subject: 'Quantitative Aptitude', want: /discount|profit.*loss|percentage/i, prefer: [/profit.*loss/i, /percentage/i] },
  { re: /\bspends?\s+\d+\s*%|\bamount is left\b|\bwhat amount is left\b|\b\d+\s*%\s*of\s+(it|the|a|his|her)\b|\b\d+\s*%\s*of\s*[\d,]+\b|\bwhat is \d+\s*%/i, topic: 'Percentage', subject: 'Quantitative Aptitude', want: /percentage|profit.*loss/i, prefer: [/percentage/i, /profit.*loss/i] },
  { re: /\bratio\s*\d+\s*:\s*\d+|\bprofit is shar|\bprofit sharing\b|\bpartnership\b|\bshared .* in the ratio\b/i, topic: 'Ratio and Proportion', subject: 'Quantitative Aptitude', want: /ratio.*proportion|partnership|profit.*loss/i, prefer: [/ratio.*proportion/i, /partnership/i] },
  { re: /\bbought\b.*\beach\b|\bsold .* at\b|\bmarked price\b|\bcost price\b|\bselling price\b|\btotal cost\b/i, topic: 'Profit and Loss', subject: 'Quantitative Aptitude', want: /profit.*loss|percentage/i, prefer: [/profit.*loss/i] },
  { re: /\btime and work\b|\bwork completion\b|\bcistern\b|\b(?:a|the) (?:pipe|tank)\b/i, topic: 'Time and Work', subject: 'Quantitative Aptitude', want: /time.*work|pipes.*cistern/i, prefer: [/time.*work/i, /pipes.*cistern/i] },
  { re: /\bboats?\b|\bstreams?\b|\bupstream\b|\bdownstream\b/i, topic: 'Boats and Streams', subject: 'Quantitative Aptitude', want: /boats.*stream/i },
  { re: /\bmensuration\b|\barea of\b|\bvolume of\b|\bsurface area\b|\bcircumference\b/i, topic: 'Mensuration', subject: 'Quantitative Aptitude', want: /mensuration/i, prefer: [/mensuration.*2d/i, /mensuration/i] },
  { re: /\bpermutation\b|\bcombination\b|\bfactorial\b/i, topic: 'Permutation and Combination', subject: 'Quantitative Aptitude', want: /permutation.*combination/i },
  { re: /\bprobability\b|\bchance of\b/i, topic: 'Probability', subject: 'Quantitative Aptitude', want: /probability/i },
  // non-English content misfiled under English chapters
  { re: /\breserve bank of india\b|\bheadquarters\b/i, topic: 'Banking Awareness', subject: 'Banking Awareness', want: /banking awareness/i, pick: /rbi function/i },
  { re: /\bkyc\b|\bknow your customer\b|\bverifying the identity\b|\bidentity of a customer\b|\baml\b|\bmoney laundering\b|\bcustomer verification\b/i, topic: 'Banking Awareness', subject: 'Banking Awareness', want: /banking awareness/i, pick: /banking term/i },
  { re: /\bcheque truncation\b|\bneft\b|\brtgs\b|\bnet banking\b|\bdigital banking\b|\bupi\b|\bcore banking\b/i, topic: 'Banking Awareness', subject: 'Banking Awareness', want: /banking awareness/i, pick: /digital banking/i },
  { re: /\btype of loan\b|\btype of account\b|\bsecured by a mortgage\b|\bmortgage\b|\bhome loan\b|\bcollateral\b|\ballows (?:multiple )?withdrawals\b/i, topic: 'Banking Awareness', subject: 'Banking Awareness', want: /banking awareness/i, pick: /types?\s+of\s+banks?/i },
  { re: /\bcreditworthiness\b|\bcredit facility\b|\bcapital adequacy\b|\btotal assets.*total liabilities\b|\bcreditworthiness check\b/i, topic: 'Banking Awareness', subject: 'Banking Awareness', want: /banking awareness/i, pick: /banking term/i },
  { re: /\bcash reserve ratio\b|\bslr\b|\bstatutory liquidity\b|\brepo rate\b|\breverse repo\b|\bbank rate\b/i, topic: 'Banking Awareness', subject: 'Banking Awareness', want: /banking awareness/i, pick: /current rate/i },
  { re: /\bfinancial inclusion\b|\bfinancial literacy\b|\bscheme\b/i, topic: 'Banking Awareness', subject: 'Banking Awareness', want: /banking awareness/i, pick: /financial inclusion|scheme/i, prefer: [/financial inclusion/i, /scheme/i] },
  { re: /\bsebi\b|\bnabard\b|\bnational housing bank\b|\bfsdc\b|\bprudential norms\b|\bliquidity position\b|\bfinancial instrument\b|\bcredit score\b|\bshort-term loan\b|\bopposite of ['"]?deposit\b|\brisk management technique\b|\bnet profits to its total assets\b|\bdeduct the interest on loan\b/i, topic: 'Banking Awareness', subject: 'Banking Awareness', subjectRe: /banking awareness|general awareness|general knowledge/i, want: /banking awareness/i, pick: /banking term|rbi function/i },
  { re: /\bfiscal policy\b|\bmonetary policy\b|\btrade deficit\b|\binflation\b|\bgdp\b/i, topic: 'Economics', subject: 'General Knowledge', subjectRe: /general (awareness|knowledge)|econom/i, want: /econom/i, pick: /banking term|general knowledge|static gk/i },
  // genuine English content misfiled between English chapters
  { re: /\bsimilar in meaning\b|\bopposite in meaning\b|\bsynonym\b|\bantonym\b|\bone who\b|\ba person who\b|\bword most similar\b|\bclosest in meaning\b/i, topic: 'Vocabulary', subject: 'English Language', want: /synonym|antonym|vocabulary|word|one word/i, prefer: [/synonym/i, /antonym/i, /one word/i, /vocabulary|word/i] },
  { re: /\bidiom\b|\bproverb\b/i, topic: 'Idioms and Proverbs', subject: 'English Language', want: /idiom|proverb/i },
  { re: /\bsentence correction\b|\bgrammatically incorrect\b|\bincorrect part\b/i, topic: 'Error Detection', subject: 'English Language', want: /error detect|sentence correction|grammar|improvement/i, prefer: [/error detect/i, /sentence correction|improvement/i] },
  { re: /\bcloze test\b|\bfill in the blanks?\b|\bdouble fillers?\b|\bsingle fillers?\b/i, topic: 'Fill in the Blanks', subject: 'English Language', want: /fill|cloze|blank|filler/i, prefer: [/fill/i, /cloze/i] },
];

function textTopics(text) {
  const out = [];
  for (const t of TEXT_TOPICS) if (t.re.test(text)) out.push(t);
  return out;
}

// Chapters that are just a subject name ("Quantitative Aptitude", "English
// Language") are dumping grounds — rank them below a real topic chapter.
const isSubjectShaped = (name, subjectName) =>
  tokens(name).length > 0 && tokens(name).join('|') === tokens(subjectName).join('|');

const NON_ENGLISH = /program|engineer|civil|mechanic|electrical|electronic|chemis|physic|biolog|math|algebra|geometr|trigonometr|calculus|statistic|probab|econom|financ|account|commerce|market|psycholog|sociolog|histor|geograph|polity|constitution|medic|surgery|anatom|pharmacolog|botan|zoolog|geolog|mining|agricultur|irrigat|survey|soil|concret|construct|architect|thermo|fluid|structural|highway|transport|ecolog|computer|software|hardware|network|database|digital|circuit|engine\b|turbine|machine|tool|furnitur|textile|nutr|dairy|fisher|veterinar|forest|anthropolog|archaeolog|philosoph|music|dance|paint|sculpt|film|theat|sport|cricket|hockey|athlet|olympi|robot|renewable|energy|power|social work|labor law|taxation|income tax|management principle|business stud|demand and supply|capital structure|book building|data structure|operating system|pipes and cisterns|arithmetic|reasoning|drawing and drafting|heat transfer|pavement|welding|induction motor|inductance|electromagnetic|mcluhan|mass communication|media studies|solar system|existent|systems approach|lay.off|tcp\b|johnson counter|prefix.postfix|processor|task management|right to information|niti aayog|law\b/i;

async function main() {
  const prisma = new PrismaClient();

  // 1. misaligned verdicts (dedupe keep last)
  const byId = new Map();
  for (const l of fs.readFileSync(BAD_FILE, 'utf8').split('\n').filter(Boolean)) {
    const v = JSON.parse(l);
    if (v.aligned === false) byId.set(v.id, v);
  }
  const verdicts = [...byId.values()];
  console.log(`Misaligned verdicts: ${verdicts.length}`);

  // 2. questions + chapter/exam context
  const questions = await prisma.question.findMany({
    where: { id: { in: verdicts.map((v) => v.id) }, isActive: true },
    select: {
      id: true, text: true, chapterId: true, conceptId: true,
      chapter: { select: { id: true, name: true, subject: { select: { exam: { select: { name: true } } } } } },
    },
  });
  console.log(`Active misaligned questions: ${questions.length} (inactive/skipped: ${verdicts.length - questions.length})`);

  // 3. all chapters per exam (any subject)
  const chapters = await prisma.chapter.findMany({
    select: { id: true, name: true, subject: { select: { name: true, exam: { select: { name: true } } } } },
  });
  const chaptersByExam = new Map();
  for (const c of chapters) {
    const e = c.subject.exam.name;
    if (!chaptersByExam.has(e)) chaptersByExam.set(e, []);
    chaptersByExam.get(e).push(c);
  }

  // 4. concept paths — load taxonomy once
  const allNodes = await prisma.taxonomyNode.findMany({ select: { id: true, parentId: true, nameEnglish: true, level: true } });
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const pathCache = new Map();
  function conceptInfo(conceptId) {
    if (conceptId == null) return null;
    if (pathCache.has(conceptId)) return pathCache.get(conceptId);
    let node = nodeMap.get(conceptId);
    const chain = [];
    const seen = new Set();
    while (node && !seen.has(node.id)) { seen.add(node.id); chain.unshift(node); node = node.parentId ? nodeMap.get(node.parentId) : null; }
    const info = {
      subject: chain.find((n) => n.level === 'SUBJECT')?.nameEnglish ?? null,
      domain: chain.find((n) => n.level === 'DOMAIN')?.nameEnglish ?? null,
      topic: chain.find((n) => n.level === 'TOPIC')?.nameEnglish ?? null,
      leaf: chain[chain.length - 1]?.nameEnglish ?? null,
    };
    pathCache.set(conceptId, info);
    return info;
  }

  // 5. attempt counts
  const attemptCounts = new Map();
  const grouped = await prisma.questionAttempt.groupBy({ by: ['questionId'], where: { questionId: { in: questions.map((q) => q.id) } }, _count: { _all: true } });
  for (const g of grouped) attemptCounts.set(g.questionId, g._count._all);

  // 6. build plan
  const moves = [], deactivations = [], left = [], ambiguous = [];
  for (const q of questions) {
    const v = byId.get(q.id);
    const exam = q.chapter.subject.exam.name;
    const ci = conceptInfo(q.conceptId);

    const candidates = [];
    const pushC = (s) => { const c = cleanTopic(s); if (c && c.length >= 3 && !candidates.includes(c)) candidates.push(c); };
    pushC(ci?.topic);
    pushC(ci?.leaf);
    pushC(v.targetTopic);
    pushC(v.reason);

    const examChapters = (chaptersByExam.get(exam) || []).filter((c) => c.id !== q.chapterId);

    const base = {
      id: q.id, exam, fromChapterId: q.chapterId, fromChapterName: q.chapter.name,
      attempts: attemptCounts.get(q.id) || 0,
      targetTopic: v.targetTopic || '', reason: v.reason || '',
      text: q.text.slice(0, 120), candidates,
    };
    const base2 = { ...base, conceptSubject: ci?.subject || null, conceptDomain: ci?.domain || null };
    const place = (ch, via, viaText) => moves.push({ ...base, toChapterId: ch.id, toChapterName: ch.name, toSubject: ch.subject.name, via, viaText });

    // --- A. text-derived routing (highest confidence; ignores the noisy LLM targetTopic)
    // Rule shape: re (detects the real topic from the question text) ->
    //   want (chapters that may host it) -> pick (a specific chapter-name regex) ->
    //   prefer (ordered chapter-name regexes used to break ties).
    let placed = false;
    for (const d of textTopics(q.text)) {
      let pool = examChapters.filter((ch) => d.want.test(ch.name));
      if (pool.length === 0) continue;
      if (d.pick) {
        const narrowed = pool.filter((ch) => d.pick.test(ch.name));
        if (narrowed.length) pool = narrowed;
      }
      if (pool.length === 0) continue;
      if (pool.length > 1 && d.prefer) {
        for (const pref of d.prefer) {
          const hit = pool.filter((ch) => pref.test(ch.name));
          if (hit.length) { pool = hit; break; }
        }
      }
      if (pool.length === 1) { place(pool[0], d.topic, true); placed = true; break; }
      // multiple candidates remain: prefer a real topic chapter over a subject-named dump
      const specific = pool.filter((ch) => !isSubjectShaped(ch.name, ch.subject.name));
      if (specific.length === 1) { place(specific[0], d.topic, true); placed = true; break; }
      ambiguous.push({ ...base, matchNames: pool.map((c) => c.name), why: `text topic "${d.topic}"` });
      placed = true;
      break;
    }
    if (!placed) {
      // A2. no topic-level chapter matched: exams like "Banking Exams (IBPS/SBI)" only
      // have subject-named chapters ("Quantitative Aptitude"), so fall back to the
      // subject dump-chapter. Only ever targets a chapter whose name equals its subject,
      // and never English — so a genuine English question can never land here.
      for (const d of textTopics(q.text)) {
        if (!d.subject || /english/i.test(d.subject)) continue;
        let subj = examChapters.filter((ch) =>
          isSubjectShaped(ch.name, ch.subject.name)
          && (d.subjectRe ? d.subjectRe.test(ch.subject.name) : ch.subject.name.toLowerCase().includes(d.subject.toLowerCase())));
        if (!subj.length) continue;
        if (d.pick) {
          const narrowed = subj.filter((ch) => d.pick.test(ch.name));
          if (narrowed.length) subj = narrowed;
        }
        place(subj[0], d.topic, true); placed = true; break;
      }
    }
    if (placed) continue;

    // --- B. generic token matching (concept path + LLM topic), used when A found no chapter
    const matches = [];
    for (const ch of examChapters) {
      const ct = tokens(ch.name);
      if (!ct.length) continue;
      const ctSet = new Set(ct);
      const hit = candidates.find((cand) => { const candT = tokens(cand); return candT.length && candT.every((t) => ctSet.has(t)); });
      if (hit) matches.push({ ch, cand: hit, exact: tokens(hit).length === ct.length });
    }
    // promote to exact if ANY candidate token-equals the chapter
    for (const m of matches) {
      if (m.exact) continue;
      const ct = tokens(m.ch.name);
      if (candidates.some((cand) => { const t = tokens(cand); return t.length && t.length === ct.length && t.every((x) => ct.includes(x)); })) m.exact = true;
    }

    const exact = matches.filter((m) => m.exact);
    const pickFrom = (list) => {
      const specific = list.filter((m) => !isSubjectShaped(m.ch.name, m.ch.subject.name));
      return specific.length ? specific[0] : list[0];
    };
    // A loose token hit ("History" ⊂ "History of Computer") is only trustworthy as an
    // in-subject regrouping. Cross-subject moves require an exact token equality.
    const usable = matches.filter((m) => m.exact || m.ch.subject.name === q.chapter.subject.name);

    if (exact.length === 1 || (exact.length === 0 && usable.length === 1)) {
      const m = exact.length === 1 ? pickFrom(exact) : usable[0];
      place(m.ch, m.cand, false);
    } else if (usable.length > 1) {
      ambiguous.push({ ...base, matchNames: usable.map((m) => m.ch.name) });
    } else {
      // No chapter match: classify by LLM targetTopic (primary), not concept pointer.
      const tt = cleanTopic(v.targetTopic);
      if (tt && NON_ENGLISH.test(tt)) {
        deactivations.push({ ...base2, why: 'LLM topic is non-English' });
      } else if (tt && isEnglishy(tt)) {
        left.push({ ...base2, why: 'LLM topic is English content' });
      } else if (!tt && ci && (ci.subject === 'English' || ci.domain?.startsWith('English'))) {
        left.push({ ...base2, why: 'concept under English, no LLM topic' });
      } else if (!tt && ci == null && isEnglishy(q.text.slice(0, 200))) {
        left.push({ ...base2, why: 'null concept, English-looking text' });
      } else {
        // LLM topic present but neither clearly English nor clearly not — needs human review
        const textEnglish = isEnglishy(q.text.slice(0, 200));
        ambiguous.push({ ...base2, matchNames: [], why: 'unclear topic', textEnglish });
      }
    }
  }

  // 7. summary
  const withAtt = (arr) => arr.filter((a) => a.attempts > 0).length;
  const sumAtt = (arr) => arr.reduce((s, a) => s + a.attempts, 0);
  console.log(`\nPLAN:
  MOVE        : ${moves.length} (with attempts: ${withAtt(moves)}, attempts total: ${sumAtt(moves)})
  DEACTIVATE  : ${deactivations.length} (with attempts: ${withAtt(deactivations)}, attempts total: ${sumAtt(deactivations)})
  LEFT        : ${left.length}
  AMBIGUOUS   : ${ambiguous.length}`);

  const byExam = (arr) => { const m = new Map(); for (const a of arr) m.set(a.exam, (m.get(a.exam) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  console.log(`\nMOVE by exam: ${byExam(moves).map(([e, n]) => `${e}=${n}`).join(', ')}`);
  console.log(`DEACTIVATE by exam: ${byExam(deactivations).map(([e, n]) => `${e}=${n}`).join(', ')}`);
  const byWhy = (arr) => { const m = new Map(); for (const a of arr) m.set(a.why || '?', (m.get(a.why || '?') || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  console.log(`DEACTIVATE by why: ${byWhy(deactivations).map(([w, n]) => `${w}=${n}`).join(', ')}`);
  console.log(`LEFT by why: ${byWhy(left).map(([w, n]) => `${w}=${n}`).join(', ')}`);
  console.log(`AMBIGUOUS by why: ${byWhy(ambiguous).map(([w, n]) => `${w}=${n}`).join(', ')}`);

  const show = (label, arr, fmt) => {
    console.log(`\n-- ${label} samples --`);
    for (const a of arr.slice(0, 8)) console.log('  ' + fmt(a));
  };
  show('MOVE', moves, (a) => `${a.exam} | ${a.fromChapterName} -> "${a.toChapterName}" (via ${a.via}) :: ${a.text}`);
  show('DEACTIVATE', deactivations, (a) => `${a.exam} | ${a.fromChapterName} | conceptSubj=${a.conceptSubject} | tt="${a.targetTopic}" :: ${a.text}`);
  show('LEFT', left, (a) => `${a.exam} | ${a.fromChapterName} | tt="${a.targetTopic}" [${a.why}] :: ${a.text}`);
  show('AMBIGUOUS', ambiguous, (a) => `${a.exam} | ${a.fromChapterName} | ${a.matchNames.length ? 'cand=[' + a.matchNames.join(' / ') + ']' : `[${a.why}] tt="${a.targetTopic}"`} :: ${a.text}`);

  const plan = { generatedAt: new Date().toISOString(), source: 'eng_alignment_bad.jsonl', moves, deactivations, left, ambiguous };
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2));
  console.log(`\nPlan written: ${PLAN_FILE}`);

  if (!APPLY) { console.log('DRY-RUN — nothing changed. Re-run with --apply to execute.'); await prisma.$disconnect(); return; }

  // 8. apply
  const rollback = { appliedAt: new Date().toISOString(), moved: [], deactivated: [] };
  for (const m of moves) {
    await prisma.question.update({ where: { id: m.id }, data: { chapterId: m.toChapterId } });
    rollback.moved.push({ id: m.id, from: m.fromChapterId, to: m.toChapterId });
  }
  for (const d of deactivations) {
    await prisma.question.update({ where: { id: d.id }, data: { isActive: false } });
    rollback.deactivated.push({ id: d.id });
  }
  fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2));
  console.log(`APPLIED: moved=${moves.length} deactivated=${deactivations.length}`);
  console.log(`Rollback: ${ROLLBACK_FILE} (restore chapterId from 'moved', set isActive=true for 'deactivated')`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
