#!/usr/bin/env tsx
/**
 * DESTRUCTIVE — onboarding-rebuild cutover.
 *
 * Truncates every transactional table so all users re-onboard from scratch.
 * The plan names User / Session / Order / ProcessedMessage, but Order is
 * FK-referenced by Payment + ImageJob (and Payment by Refund), and User by the
 * new Brand* tables — so we truncate the full dependent set with RESTART
 * IDENTITY CASCADE to avoid foreign-key violations.
 *
 * PRESERVED: webhook_events (audit log) and prompt_templates.
 *
 * Run (refuses without the flag):
 *   npx tsx scripts/truncate-all.ts --yes
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
// Generated client is at a custom output path; import it directly so this
// script works without @autmn/db being built to dist/.
import { PrismaClient } from '../packages/db/src/generated/client/index.js';

// Manual .env loader — avoids a dotenv dependency in scripts/.
function loadEnv(envPath: string): void {
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf-8');
  } catch {
    console.error(`Could not read ${envPath}`);
    process.exit(1);
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) process.env[key] = value;
  }
}

// Child-before-parent order. CASCADE handles anything not listed, but being
// explicit documents intent and keeps the wipe auditable.
const TABLES = [
  'brand_summary_versions',
  'brand_assets',
  'brand_profiles',
  'refunds',
  'payments',
  'image_jobs',
  'orders',
  'sessions',
  'users',
  'processed_messages',
] as const;

// Tables we deliberately keep.
const PRESERVED = ['webhook_events', 'prompt_templates'] as const;

async function rowCount(prisma: PrismaClient, table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT count(*)::bigint AS c FROM "${table}"`,
  );
  return Number(rows[0]?.c ?? 0);
}

async function main(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    console.error(
      'Refusing to run without --yes.\n' +
        'This IRREVERSIBLY truncates: ' + TABLES.join(', ') + '.\n' +
        'Re-run with:  npx tsx scripts/truncate-all.ts --yes',
    );
    process.exit(1);
  }

  loadEnv(resolve(import.meta.dirname, '../.env'));

  const dbHost = (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '').replace(/^.*@/, '').replace(/[/?].*$/, '');
  console.log(`Target DB host: ${dbHost || '(unknown)'}\n`);

  const prisma = new PrismaClient({ log: ['error'] });

  try {
    console.log('Row counts BEFORE:');
    for (const t of TABLES) {
      console.log(`  ${t}: ${await rowCount(prisma, t)}`);
    }

    const list = TABLES.map((t) => `"${t}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    console.log('\nTRUNCATE ... RESTART IDENTITY CASCADE executed.\n');

    console.log('Row counts AFTER:');
    let allZero = true;
    for (const t of TABLES) {
      const c = await rowCount(prisma, t);
      if (c !== 0) allZero = false;
      console.log(`  ${t}: ${c}`);
    }

    console.log('\nPreserved (not truncated):');
    for (const t of PRESERVED) {
      console.log(`  ${t}: ${await rowCount(prisma, t)} rows kept`);
    }

    if (!allZero) {
      console.error('\nWARNING: some target tables are not empty. Investigate.');
      process.exit(1);
    }
    console.log('\nAll target tables are empty. Cutover complete.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('truncate-all failed:', err);
  process.exit(1);
});
