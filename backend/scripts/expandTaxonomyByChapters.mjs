// #4d: expand taxonomy with the question set's chapter themes, then tag the
// chapter's SUBJECT-level questions to the (possibly newly created) node.
// Deterministic, reviewable, reversible (dry first). 
// Run: node scripts/expandTaxonomyByChapters.mjs [dry]   (dry is default)
//      node scripts/expandTaxonomyByChapters.mjs apply
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2];
}
const APPLY = process.argv.includes('apply');
const prisma = new PrismaClient();

const THEME_SUBJECT = {
  'Indian Constitution': 614, 'Kerala History': 48, 'Indian History': 48,
  'Indian Geography': 87, 'Geography of Kerala': 87, 'Economy': 152,
  'Environment & Ecology': 469, 'Science & Technology': 295, 'Biology Basics': 295,
  'Chemistry Basics': 295, 'Physics Basics': 295, 'Computer Basics': 426,
  'Government Schemes': 563, 'Sports & Awards': 591, 'Important Appointments': 563,
  'Monthly Current Affairs': 20, 'Kerala State News': 20, 'National News': 20, 'International News': 20,
  'Malayalam Grammar': 383, 'Comprehension': 404, 'Synonyms & Antonyms': 404,
  'Vocabulary': 404, 'Grammar Basics': 404, 'Algebra': 475, 'Number System': 475,
  'Percentages': 355, 'Profit & Loss': 355, 'Simple & Compound Interest': 355,
  'Mensuration': 355, 'Time & Distance': 355, 'Time & Work': 355, 'Mental Ability': 302,
};
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function main() {
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, parentId: true, level: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const lower = new Map();
  for (const n of nodes) { const k = (n.nameEnglish || '').toLowerCase(); if (!lower.has(k)) lower.set(k, []); lower.get(k).push(n); }
  function subjectOf(id) { let cur = id, seen = new Set(); while (cur != null && !seen.has(cur)) { seen.add(cur); const n = nodeById.get(cur); if (!n) break; if (n.level === 'SUBJECT') return cur; cur = n.parentId; } return null; }
  const subjectIds = new Set(nodes.filter((n) => n.level === 'SUBJECT').map((n) => n.id));
  const maxId = Math.max(...nodes.map((n) => n.id));

  const chapters = await prisma.chapter.findMany({ select: { id: true, name: true } });
  const questions = await prisma.question.findMany({ select: { id: true, chapterId: true, conceptId: true } });
  const chSubjIds = new Map();
  for (const q of questions) {
    if (q.conceptId == null || !subjectIds.has(q.conceptId)) continue;
    (chSubjIds.get(q.chapterId) || (chSubjIds.set(q.chapterId, []).get(q.chapterId))).push(q.id);
  }

  // plan: theme -> node (existing to reuse, or NEW to create)
  const plans = []; // {theme, subject, existingId?, mkDomain, qids, qCount}
  for (const ch of chapters) {
    if (ch.name === 'Imported Corpus') continue;
    const theme = THEME_SUBJECT[ch.name];
    if (!theme) continue;
    const qids = chSubjIds.get(ch.id);
    if (!qids || qids.length === 0) continue;
    const subjName = nodeById.get(theme)?.nameEnglish;
    if (ch.name.toLowerCase() === (subjName || '').toLowerCase()) { // theme == subject name (e.g. Indian Constitution)
      plans.push({ theme: ch.name, subject: theme, existingId: theme, qids, qCount: qids.length, skip: 'subject itself' });
      continue;
    }
    const cands = (lower.get(ch.name.toLowerCase()) || []).filter((n) => subjectOf(n.id) === theme && n.id !== theme);
    if (cands.length) {
      const best = cands.slice().sort((a, b) => (b.level === 'TOPIC' ? 1 : 0) - (a.level === 'TOPIC' ? 1 : 0))[0];
      plans.push({ theme: ch.name, subject: theme, existingId: best.id, existingLevel: best.level, qids, qCount: qids.length });
    } else {
      plans.push({ theme: ch.name, subject: theme, mk: true, qids, qCount: qids.length });
    }
  }

  let newNodes = 0, mappedQ = 0, skipQ = 0;
  const created = [];
  console.log((APPLY ? 'APPLY' : 'DRY') + ' plan:');
  for (const p of plans) {
    if (p.skip) { skipQ += p.qCount; continue; }
    mappedQ += p.qCount;
    if (p.mk) { newNodes++; created.push(p.theme); }
    console.log(`  ${p.qCount.toString().padStart(4)} q  ${p.theme}  (subj ${nodeById.get(p.subject)?.nameEnglish}) -> ${p.mk ? 'CREATE DOMAIN' : 'EXISTING ' + (p.existingLevel || '') + ' id=' + p.existingId}`);
  }
  console.log(`\nquestions to make specific: ${mappedQ} | new DOMAIN nodes to create: ${newNodes} | left on subject node: ${skipQ}`);

  if (!APPLY) { await prisma.$disconnect(); console.log('Dry complete - no changes.'); return; }

  // create missing DOMAIN nodes
  let nextId = maxId;
  const createdMap = new Map(); // theme -> id
  for (const p of plans) {
    if (p.mk) {
      nextId++;
      const slug = `${slugify(p.theme)}-${nextId}`;
      await prisma.taxonomyNode.create({ data: { id: nextId, parentId: p.subject, level: 'DOMAIN', nameEnglish: p.theme, slug, status: 'active', importance: 'medium', difficulty: 'beginner', tags: [], aliases: [] } });
      createdMap.set(p.theme, nextId);
    }
  }

  // assign questions (subject-level only) to each theme's target node
  let updatedQuestions = 0;
  for (const p of plans) {
    if (p.skip) continue;
    const target = p.existingId || createdMap.get(p.theme);
    const r = await prisma.question.updateMany({ where: { id: { in: p.qids } }, data: { conceptId: target } });
    updatedQuestions += r.count;
  }
  const finalSubject = await prisma.question.count({ where: { conceptId: { in: [...subjectIds] } } });
  const finalWith = await prisma.question.count({ where: { conceptId: { not: null } } });
  console.log(JSON.stringify({ created_nodes: created.length, updated_questions: updatedQuestions, remaining_subject_level: finalSubject, now_specific: finalWith - finalSubject }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });