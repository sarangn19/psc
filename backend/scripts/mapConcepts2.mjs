import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Map of subject names in questions → taxonomy subject names
const NAME_MAP = {
  'Reasoning Ability': 'Reasoning',
  'General Awareness': 'General Knowledge',
  'English Language': 'English',
  'Computer Awareness': 'Computer Science',
  'Computer Applications': 'Computer Science',
};

// Get all DOMAIN nodes grouped by subject name (fuzzy)
const allDomains = await p.$queryRawUnsafe(`
  SELECT t.id, t."nameEnglish", parent."nameEnglish" as subject_name
  FROM taxonomy_nodes t
  JOIN taxonomy_nodes parent ON t."parentId" = parent.id
  WHERE t.level = 'DOMAIN' AND parent.level = 'SUBJECT'
`);

const subjectDomains = new Map();
for (const d of allDomains) {
  const key = d.subject_name.toLowerCase();
  if (!subjectDomains.has(key)) subjectDomains.set(key, []);
  subjectDomains.get(key).push({ id: d.id, name: d.nameEnglish });
}

// Get remaining unmapped questions
const unmapped = await p.$queryRawUnsafe(`
  SELECT q.id, q.text, q."chapterId", c.name as chapter_name, s.name as subject_name
  FROM questions q
  JOIN chapters c ON q."chapterId" = c.id
  JOIN subjects s ON c."subjectId" = s.id
  WHERE q."conceptId" IS NULL
`);

console.log(`Remaining: ${unmapped.length}`);

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

const updates = [];
let fallbackCount = 0;

for (const q of unmapped) {
  // Try mapped name first, then original
  const mappedName = NAME_MAP[q.subject_name];
  let available = [];
  if (mappedName) {
    available = subjectDomains.get(mappedName.toLowerCase()) || [];
  }
  if (available.length === 0) {
    available = subjectDomains.get(q.subject_name.toLowerCase()) || [];
  }
  if (available.length === 0) {
    // Fuzzy: try partial match
    for (const [key, val] of subjectDomains) {
      if (key.includes(q.subject_name.toLowerCase().split(' ')[0]) ||
          q.subject_name.toLowerCase().includes(key.split(' ')[0])) {
        available = val;
        break;
      }
    }
  }

  if (available.length === 0) {
    fallbackCount++;
    continue;
  }

  const match = bestDomainMatch(q.chapter_name, available);
  if (match) {
    updates.push({ id: q.id, conceptId: match.id });
  } else {
    // Assign to first DOMAIN of the subject
    updates.push({ id: q.id, conceptId: available[0].id });
  }
}

console.log(`To update: ${updates.length}, No taxonomy found: ${fallbackCount}`);

const batchSize = 500;
for (let i = 0; i < updates.length; i += batchSize) {
  const batch = updates.slice(i, i + batchSize);
  await Promise.all(
    batch.map(u =>
      p.question.update({ where: { id: u.id }, data: { conceptId: u.conceptId } })
    )
  );
  process.stdout.write(`\rUpdated ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
}

// Final count
const stillUnmapped = await p.question.count({ where: { conceptId: null } });
console.log(`\nDone! Still unmapped: ${stillUnmapped}`);
process.exit();
