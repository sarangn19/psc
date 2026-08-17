// TEMP: which chapter-theme nodes already exist in the taxonomy, and how many
// subject-level questions each named chapter would map to. No writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2];
}
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

async function main() {
  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, parentId: true, level: true } });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const lower = new Map();
  for (const n of nodes) { const k = (n.nameEnglish || '').toLowerCase(); if (!lower.has(k)) lower.set(k, []); lower.get(k).push(n); }
  function subjectOf(id) { let cur = id, seen = new Set(); while (cur != null && !seen.has(cur)) { seen.add(cur); const n = nodeById.get(cur); if (!n) break; if (n.level === 'SUBJECT') return cur; cur = n.parentId; } return null; }
  const subjectIds = new Set(nodes.filter((n) => n.level === 'SUBJECT').map((n) => n.id));

  const chapters = await prisma.chapter.findMany({ select: { id: true, name: true } });
  const questions = await prisma.question.findMany({ select: { id: true, chapterId: true, conceptId: true } });

  const chQ = new Map();
  for (const q of questions) {
    if (q.conceptId == null || !subjectIds.has(q.conceptId)) continue;
    (chQ.get(q.chapterId) || (chQ.set(q.chapterId, []).get(q.chapterId))).push(q.id);
  }

  console.log('named chapters with subject-level questions AND existing/missing topic nodes:');
  let mapQ = 0, missing = 0;
  for (const ch of chapters) {
    if (ch.name === 'Imported Corpus') continue;
    const theme = THEME_SUBJECT[ch.name];
    if (!theme) continue;
    const ids = chQ.get(ch.id);
    if (!ids || ids.length === 0) continue;
    mapQ += ids.length;
    const cands = (lower.get(ch.name.toLowerCase()) || []).filter((n) => subjectOf(n.id) === theme && n.id !== theme);
    if (cands.length === 0) { missing++; console.log(`  MISSING node  ${ch.name}  (subj ${theme})  -> maps ${ids.length} questions`); }
    else {
      const best = cands.slice().sort((a, b) => (b.level === 'TOPIC' ? 1 : 0) - (a.level === 'TOPIC' ? 1 : 0))[0];
      console.log(`  EXISTING ${best.level.padEnd(6)} id=${best.id}  ${ch.name}  (subj ${theme})  -> maps ${ids.length} questions`);
    }
  }
  console.log('\nquestions mappable: ' + mapQ + ' | themes missing a node: ' + missing);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });