import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Step 1: Get all DOMAIN-level taxonomy nodes with their parent subject name
const domains = await p.$queryRawUnsafe(`
  SELECT t.id, t."nameEnglish", t."parentId",
    parent."nameEnglish" as subject_name, parent.id as subject_id
  FROM taxonomy_nodes t
  JOIN taxonomy_nodes parent ON t."parentId" = parent.id
  WHERE t.level = 'DOMAIN' AND parent.level = 'SUBJECT'
  ORDER BY parent."nameEnglish", t."nameEnglish"
`);

console.log(`Found ${domains.length} DOMAIN nodes`);

// Build subject → domains map
const subjectDomains = new Map();
for (const d of domains) {
  const key = d.subject_name;
  if (!subjectDomains.has(key)) subjectDomains.set(key, []);
  subjectDomains.get(key).push({ id: d.id, name: d.nameEnglish });
}

// Step 2: Get all questions without conceptId, grouped by chapter
const unmapped = await p.$queryRawUnsafe(`
  SELECT q.id, q.text, q."chapterId", c.name as chapter_name, s.name as subject_name
  FROM questions q
  JOIN chapters c ON q."chapterId" = c.id
  JOIN subjects s ON c."subjectId" = s.id
  WHERE q."conceptId" IS NULL
  ORDER BY s.name, c.name
`);

console.log(`Found ${unmapped.length} unmapped questions`);

// Step 3: Match each question's chapter to a DOMAIN node using keyword overlap
function bestDomainMatch(chapterName, availableDomains) {
  const chapterWords = chapterName.toLowerCase().split(/[\s&\-(),]+/).filter(w => w.length > 2);
  let bestScore = 0;
  let bestDomain = null;
  for (const d of availableDomains) {
    const domainWords = d.name.toLowerCase().split(/[\s&\-(),]+/).filter(w => w.length > 2);
    let score = 0;
    for (const cw of chapterWords) {
      for (const dw of domainWords) {
        if (cw === dw || cw.includes(dw) || dw.includes(cw)) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = d;
    }
  }
  return bestScore > 0 ? bestDomain : null;
}

// Step 4: Update in batches
let mapped = 0;
let unmappedRemaining = 0;
const batchSize = 500;
const updates = [];

for (const q of unmapped) {
  const available = subjectDomains.get(q.subject_name) || [];
  if (available.length === 0) {
    unmappedRemaining++;
    continue;
  }
  const match = bestDomainMatch(q.chapter_name, available);
  if (match) {
    updates.push({ id: q.id, conceptId: match.id });
    mapped++;
  } else {
    // Fallback: assign to first DOMAIN of the subject
    if (available.length > 0) {
      updates.push({ id: q.id, conceptId: available[0].id });
      mapped++;
    } else {
      unmappedRemaining++;
    }
  }
}

console.log(`\nMapped: ${mapped}, Remaining: ${unmappedRemaining}`);

// Apply updates in batches
for (let i = 0; i < updates.length; i += batchSize) {
  const batch = updates.slice(i, i + batchSize);
  await Promise.all(
    batch.map(u =>
      p.question.update({ where: { id: u.id }, data: { conceptId: u.conceptId } })
    )
  );
  process.stdout.write(`\rUpdated ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
}

console.log('\nDone!');
process.exit();
