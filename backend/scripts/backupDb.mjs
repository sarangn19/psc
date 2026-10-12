#!/usr/bin/env node
// Backup database to JSON files — READ-ONLY (findMany/count only, never writes to DB)
// Usage: node scripts/backupDb.mjs [output-dir]
// Discovers EVERY model from the generated Prisma client metadata (Prisma.dmmf),
// with a fallback to schema.prisma, so the list can never go out of date.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const outDir = process.argv[2] || path.resolve(__dirname, '..', 'backups', new Date().toISOString().slice(0, 10));

// Auto-discover every model in the schema (never hardcode a model list again)
function discoverModels() {
  if (Prisma.dmmf?.datamodel?.models?.length) {
    return Prisma.dmmf.datamodel.models.map((m) => m.name);
  }
  const schema = fs.readFileSync(path.resolve(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  return [...schema.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

const modelNames = discoverModels();
// Prisma client delegate property = lowerCamelCase of the model name (UserExam -> userExam)
const delegateOf = (name) => name[0].toLowerCase() + name.slice(1);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  let total = 0;
  const written = [];
  const failed = [];

  for (const name of modelNames) {
    const prop = delegateOf(name);
    try {
      const data = await prisma[prop].findMany();
      fs.writeFileSync(path.join(outDir, `${prop}.json`), JSON.stringify(data, null, 2));
      console.log(`  ${prop}: ${data.length} records`);
      total += data.length;
      written.push(prop);
    } catch (e) {
      console.log(`  ${prop}: SKIPPED (${e.message.slice(0, 60)})`);
      failed.push(prop);
    }
  }

  // Also export schema
  const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
  if (fs.existsSync(schemaPath)) {
    fs.copyFileSync(schemaPath, path.join(outDir, 'schema.prisma'));
  }

  // Complete = every model discovered in the schema produced a JSON file
  const complete = failed.length === 0 && written.length === modelNames.length;
  if (complete) {
    console.log(`\nBackup complete: ${outDir} (${total} records, ${written.length}/${modelNames.length} models)`);
  } else {
    console.error(`\nBackup INCOMPLETE: ${outDir} (${written.length}/${modelNames.length} models written; failed: ${failed.join(', ') || 'unknown'})`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
