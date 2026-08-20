import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ─── 1. Load ALL taxonomy nodes in one query ────────────────────────
console.log('Loading all taxonomy nodes...');
const allRaw = await prisma.taxonomyNode.findMany({
  orderBy: { id: 'asc' },
  select: { id: true, parentId: true, level: true, nameEnglish: true, status: true, importance: true, difficulty: true },
});
console.log(`Loaded ${allRaw.length} nodes.\n`);

// Build lookup structures
const nodeById = {};
const childrenOf = {};
for (const n of allRaw) {
  nodeById[n.id] = n;
  if (!childrenOf[n.parentId]) childrenOf[n.parentId] = [];
  childrenOf[n.parentId].push(n);
}

// ─── 2. Node counts per level ───────────────────────────────────────
const byLevel = { EXAM: [], SUBJECT: [], DOMAIN: [], TOPIC: [], CONCEPT: [] };
for (const n of allRaw) { byLevel[n.level]?.push(n); }

console.log('════════════════════════════════════════════');
console.log('  NODE COUNTS PER LEVEL (GLOBAL)');
console.log('════════════════════════════════════════════\n');
for (const [level, nodes] of Object.entries(byLevel)) {
  console.log(`  ${level.padEnd(10)} ${String(nodes.length).padStart(6)}`);
}
console.log(`  ${'TOTAL'.padEnd(10)} ${String(allRaw.length).padStart(6)}`);

// ─── 3. Full tree for 3 subjects (with concepts for first) ─────────
console.log('\n════════════════════════════════════════════');
console.log('  FULL TREE: 3 SELECTED SUBJECTS');
console.log('════════════════════════════════════════════\n');

function printTree(nodeId, indent, showConcepts) {
  const kids = childrenOf[nodeId] || [];
  for (const child of kids) {
    const pad = '  '.repeat(indent);
    if (child.level === 'CONCEPT') {
      console.log(`${pad}├── ${child.nameEnglish}`);
    } else {
      console.log(`${pad}├── ${child.nameEnglish}  [${child.level}]`);
      if (child.level === 'TOPIC' && showConcepts) {
        const concepts = (childrenOf[child.id] || []).filter(c => c.level === 'CONCEPT');
        const cPad = '  '.repeat(indent + 1);
        if (concepts.length <= 8) {
          for (const c of concepts) console.log(`${cPad}├── ${c.nameEnglish}`);
        } else {
          for (const c of concepts.slice(0, 5)) console.log(`${cPad}├── ${c.nameEnglish}`);
          console.log(`${cPad}└── ... +${concepts.length - 5} more`);
        }
      } else if (child.level !== 'TOPIC') {
        printTree(child.id, indent + 1, showConcepts);
      }
    }
  }
}

// Pick 3 subjects - first one shows concepts, others don't
const subjects = byLevel.SUBJECT.slice(0, 3);
for (let i = 0; i < subjects.length; i++) {
  const s = subjects[i];
  const domainCount = (childrenOf[s.id] || []).filter(c => c.level === 'DOMAIN').length;
  const topicCount = (childrenOf[s.id] || []).filter(c => c.level === 'TOPIC').length;
  console.log(`▶ ${s.nameEnglish}  [SUBJECT] (domains: ${domainCount}, direct topics: ${topicCount})`);
  printTree(s.id, 1, i === 0);
  console.log('');
}

// ─── 4. Concept naming patterns ─────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  CONCEPT NAMING PATTERNS');
console.log('════════════════════════════════════════════\n');

const concepts = byLevel.CONCEPT;
const names = concepts.map(c => c.nameEnglish);

const patterns = {};
const knownPrefixes = [
  'introduction to', 'basic concepts of', 'key definitions',
  'fundamentals of', 'overview of', 'important ', 'key ',
  'types of', 'methods of', 'examples of', 'applications of',
  'advanced ', 'formula', 'shortcut', 'trick', 'properties of',
  'rules of', 'laws of', 'theorems', 'principles of',
  'difference between', 'comparison of', 'relationship between',
  'list of', 'steps to', 'process of', 'uses of', 'functions of',
  'causes of', 'effects of', 'impact of', 'role of',
];

for (const name of names) {
  const lower = name.toLowerCase();
  const matched = knownPrefixes.find(p => lower.startsWith(p));
  const key = matched || '(free-form name)';
  patterns[key] = (patterns[key] || 0) + 1;
}

const sorted = Object.entries(patterns).sort((a, b) => b[1] - a[1]);
console.log('Prefix distribution:');
for (const [prefix, count] of sorted) {
  const pct = ((count / names.length) * 100).toFixed(1);
  console.log(`  ${prefix.padEnd(35)} ${String(count).padStart(5)}  (${pct}%)`);
}

// Name length stats
const lengths = names.map(n => n.length);
const avgLen = (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1);
console.log(`\nName length: avg=${avgLen}  min=${Math.min(...lengths)}  max=${Math.max(...lengths)}`);

// Word count distribution
const wordCounts = names.map(n => n.split(/\s+/).length);
const avgWords = (wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length).toFixed(1);
console.log(`Word count:  avg=${avgWords}  min=${Math.min(...wordCounts)}  max=${Math.max(...wordCounts)}`);

// Sample names
console.log('\nSample concept names:');
const sample = [...names].sort(() => Math.random() - 0.5).slice(0, 15);
for (const n of sample) console.log(`  - ${n}`);

// ─── 5. Hierarchy ratios ────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  AVERAGE HIERARCHY RATIOS');
console.log('════════════════════════════════════════════\n');

function ratio(parentIds, childLevel) {
  const counts = parentIds.map(pid =>
    (childrenOf[pid] || []).filter(c => c.level === childLevel).length
  );
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    avg: counts.length ? (total / counts.length).toFixed(2) : 'N/A',
    min: counts.length ? Math.min(...counts) : 'N/A',
    max: counts.length ? Math.max(...counts) : 'N/A',
    total,
    n: counts.length,
    dist: counts,
  };
}

const subjIds = byLevel.SUBJECT.map(s => s.id);
const domainIds = byLevel.DOMAIN.map(d => d.id);
const topicIds = byLevel.TOPIC.map(t => t.id);

function p(label, r) {
  console.log(`${label}:`);
  console.log(`  avg: ${r.avg}  min: ${r.min}  max: ${r.max}  total: ${r.total}  (n=${r.n})`);
}

p('Domains per Subject', ratio(subjIds, 'DOMAIN'));
p('Topics per Domain', ratio(domainIds, 'TOPIC'));
p('Concepts per Topic', ratio(topicIds, 'CONCEPT'));

// Histogram
console.log('\n─── Concepts per Topic histogram ───');
const cDist = {};
for (const c of ratio(topicIds, 'CONCEPT').dist) { cDist[c] = (cDist[c] || 0) + 1; }
for (const [k, v] of Object.entries(cDist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`  ${String(k).padStart(3)} concepts: ${'█'.repeat(Math.min(v, 50))} (${v} topics)`);
}

// ─── 6. Per-subject breakdown ───────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  PER-SUBJECT BREAKDOWN');
console.log('════════════════════════════════════════════\n');

for (const subj of byLevel.SUBJECT) {
  const queue = [subj.id];
  const counts = { DOMAIN: 0, TOPIC: 0, CONCEPT: 0 };
  while (queue.length) {
    const pid = queue.shift();
    for (const c of (childrenOf[pid] || [])) {
      if (c.level in counts) counts[c.level]++;
      queue.push(c.id);
    }
  }
  console.log(`${subj.nameEnglish.padEnd(40)} D:${String(counts.DOMAIN).padStart(4)}  T:${String(counts.TOPIC).padStart(5)}  C:${String(counts.CONCEPT).padStart(6)}`);
}

// ─── 7. Metadata distribution for concepts ──────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  CONCEPT METADATA');
console.log('════════════════════════════════════════════\n');

function dist(field) {
  const d = {};
  for (const c of concepts) { d[c[field]] = (d[c[field]] || 0) + 1; }
  return Object.entries(d).sort((a, b) => b[1] - a[1]);
}

console.log('Status:');
for (const [k, v] of dist('status')) console.log(`  ${k.padEnd(20)} ${v}`);
console.log('\nImportance:');
for (const [k, v] of dist('importance')) console.log(`  ${k.padEnd(20)} ${v}`);
console.log('\nDifficulty:');
for (const [k, v] of dist('difficulty')) console.log(`  ${k.padEnd(20)} ${v}`);

console.log('\n════════════════════════════════════════════');
console.log('  DONE');
console.log('════════════════════════════════════════════\n');

await prisma.$disconnect();
