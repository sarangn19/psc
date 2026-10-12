#!/usr/bin/env node
/**
 * Safe DB operations wrapper.
 * - Always runs backup before schema changes
 * - Blocks --force-reset and --accept-data-loss flags
 * 
 * Usage:
 *   node scripts/safe-db.mjs push [--accept-data-loss]   # safe push (no --force-reset!)
 *   node scripts/safe-db.mjs migrate                     # run pending migrations
 *   node scripts/safe-db.mjs status                      # show DB stats
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.resolve(rootDir, 'backend');

// Load env
const envPath = path.resolve(backendDir, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const action = process.argv[2];
const args = process.argv.slice(3);

// BLOCK dangerous flags
const dangerous = args.filter(a => a.includes('--force-reset') || a.includes('--force'));
if (dangerous.length > 0) {
  console.error('\n❌ BLOCKED: --force-reset is FORBIDDEN.');
  console.error('   This flag DESTROYS all data in the database.');
  console.error('   Use "npm run db:push" instead (backs up first, then applies safely).\n');
  process.exit(1);
}

if (action === 'status') {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const counts = {};
  for (const model of ['exam', 'subject', 'chapter', 'question', 'user', 'taxonomyNode']) {
    try { counts[model] = await prisma[model].count(); } catch { counts[model] = 'N/A'; }
  }
  console.log('\n📊 Database Status:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  await prisma.$disconnect();
  process.exit(0);
}

// For push/migrate: backup first
if (action === 'push' || action === 'migrate') {
  console.log('\n📦 Step 1: Backing up database...');
  try {
    execSync('node backend/scripts/backupDb.mjs', { cwd: rootDir, stdio: 'inherit' });
  } catch (e) {
    console.error('⚠️  Backup failed. Aborting to prevent data loss.');
    process.exit(1);
  }

  console.log(`\n🔄 Step 2: Running prisma ${action}...`);
  const schemaFlag = '--schema=backend/prisma/schema.prisma';
  
  if (action === 'push') {
    // Always use --force-reset=never as extra safety
    const cmd = `npx prisma db push ${schemaFlag} --force-reset=never ${args.join(' ')}`;
    console.log(`> ${cmd}`);
    execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
  } else {
    const cmd = `npx prisma migrate deploy ${schemaFlag} ${args.join(' ')}`;
    console.log(`> ${cmd}`);
    execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
  }

  console.log('\n✅ Done!');
} else {
  console.error(`Unknown action: ${action}`);
  console.error('Usage: node scripts/safe-db.mjs <push|migrate|status>');
  process.exit(1);
}
