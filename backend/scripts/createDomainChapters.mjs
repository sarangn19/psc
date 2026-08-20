import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ROOT_ID = 1;
const originalPscNames = [
  'LDC (Lower Division Clerk)', 'LGS (Last Grade Servant)',
  'PSC Degree Level', 'Police Constable',
  'HSST (Higher Secondary School Teacher)', 'VEO (Village Extension Officer)',
];

// Find all subject records in new PSC exams that have 0 chapters
const exams = await prisma.exam.findMany({
  where: { category: 'PSC' },
  include: { subjects: { include: { chapters: true } } },
});

let totalChapters = 0;
let totalSubjectsFixed = 0;

for (const exam of exams) {
  if (originalPscNames.includes(exam.name)) continue;
  for (const subject of exam.subjects) {
    if (subject.chapters.length > 0) continue;

    // Find the SUBJECT taxonomy node for this subject under root
    const subjectNode = await prisma.taxonomyNode.findFirst({
      where: { parentId: ROOT_ID, level: 'SUBJECT', nameEnglish: subject.name },
    });
    if (!subjectNode) {
      console.log(`  ! ${exam.name}/${subject.name}: no taxonomy SUBJECT node found`);
      continue;
    }

    // Get DOMAIN children as chapters
    const domains = await prisma.taxonomyNode.findMany({
      where: { parentId: subjectNode.id, level: 'DOMAIN' },
      orderBy: { id: 'asc' },
    });
    if (domains.length === 0) {
      console.log(`  ! ${exam.name}/${subject.name}: no DOMAIN nodes found`);
      continue;
    }

    // Create chapters from domain names
    const created = await prisma.chapter.createMany({
      data: domains.map((d, i) => ({
        name: d.nameEnglish,
        subjectId: subject.id,
        order: i,
      })),
    });
    totalChapters += created.count;
    totalSubjectsFixed += 1;
    console.log(`${exam.name}/${subject.name}: +${created.count} chapters (from ${domains.length} domains)`);
  }
}

console.log(`\n=== DONE ===`);
console.log(`Subjects fixed: ${totalSubjectsFixed}`);
console.log(`Chapters created: ${totalChapters}`);
await prisma.$disconnect();