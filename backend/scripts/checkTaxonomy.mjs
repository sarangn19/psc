import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// For each unmapped subject, find existing CONCEPT-level taxonomy nodes
const subjects = ['Reasoning Ability', 'Quantitative Aptitude', 'General Awareness', 'English Language', 'Computer Awareness', 'Reasoning', 'Malayalam', 'Computer Applications'];

for (const subj of subjects) {
  const nodes = await p.taxonomyNode.findMany({
    where: {
      level: 'CONCEPT',
      nameEnglish: { contains: subj.split(' ')[0] },
    },
    select: { id: true, nameEnglish: true, parentId: true },
    take: 5,
  });
  console.log(`\n${subj} — CONCEPT nodes: ${nodes.length}`);
  for (const n of nodes) console.log(`  [${n.id}] ${n.nameEnglish}`);

  // Also try via the subject's taxonomy path
  const subjectNodes = await p.taxonomyNode.findMany({
    where: { level: 'SUBJECT', nameEnglish: { contains: subj.split(' ')[0] } },
    select: { id: true, nameEnglish: true },
    take: 3,
  });
  if (subjectNodes.length) {
    for (const sn of subjectNodes) {
      const children = await p.taxonomyNode.findMany({
        where: { parentId: sn.id },
        select: { id: true, level: true, nameEnglish: true },
      });
      console.log(`  Subject node [${sn.id}] ${sn.nameEnglish} → ${children.length} children`);
      for (const c of children.slice(0, 3)) console.log(`    [${c.id}] ${c.level}: ${c.nameEnglish}`);
    }
  }
}

process.exit();
