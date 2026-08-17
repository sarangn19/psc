import { PrismaClient, NodeLevel } from '@prisma/client';
// @ts-ignore - node:sqlite typings are not present in @types/node 20
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../..', 'taxonomy', 'data', 'taxonomy.db');
const DB_PATH = process.env.TAXONOMY_DB_PATH || DEFAULT_DB_PATH;

const CHUNK_SIZE = 500;

function safeParse(str: string | null, fallback: any): any {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Taxonomy database not found at: ${DB_PATH}`);
    console.error('Set TAXONOMY_DB_PATH to the taxonomy project\'s taxonomy.db (e.g. .../taxonomy/data/taxonomy.db)');
    process.exit(1);
  }

  console.log(`Reading taxonomy nodes from: ${DB_PATH}`);
  const db = new DatabaseSync(DB_PATH, { readOnly: true });

  const rows = db.prepare('SELECT * FROM nodes ORDER BY id').all() as any[];
  const clean = rows.filter((r) => r.name_english && String(r.name_english).trim().length > 0);

  console.log(`Found ${rows.length} nodes, importing ${clean.length} (skipping ${rows.length - clean.length} without a name)`);

  const counts: Record<string, number> = {};
  let inserted = 0;

  for (let i = 0; i < clean.length; i += CHUNK_SIZE) {
    const chunk = clean.slice(i, i + CHUNK_SIZE).map((r) => {
      const level = String(r.level).toUpperCase() as NodeLevel;
      counts[level] = (counts[level] || 0) + 1;
      return {
        id: Number(r.id),
        parentId: r.parent_id === null || r.parent_id === undefined ? null : Number(r.parent_id),
        level,
        nameEnglish: String(r.name_english),
        nameMalayalam: r.name_malayalam || null,
        nameHindi: r.name_hindi || null,
        description: r.description || null,
        aliases: safeParse(r.aliases, []),
        slug: String(r.slug),
        status: r.status || 'draft',
        importance: r.importance || 'medium',
        difficulty: r.difficulty || 'beginner',
        tags: safeParse(r.tags, []),
        metadata: safeParse(r.metadata, {}),
      };
    });

    const res = await prisma.taxonomyNode.createMany({ data: chunk, skipDuplicates: true });
    inserted += res.count;
  }

  console.log(`Imported ${inserted} taxonomy nodes:`);
  for (const [level, count] of Object.entries(counts)) {
    console.log(`  ${level}: ${count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
