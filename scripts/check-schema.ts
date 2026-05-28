#!/usr/bin/env tsx
/**
 * Smoke-test: confirms the onboarding-rebuild tables + columns are present.
 *
 * Run:  npx tsx scripts/check-schema.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '../packages/db/src/generated/client/index.js';

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

const NEW_TABLES = ['brand_profiles', 'brand_assets', 'brand_summary_versions'] as const;

const EXPECTED_COLUMNS: Record<(typeof NEW_TABLES)[number], string[]> = {
  brand_profiles: [
    'id', 'userId', 'logoUrl', 'tagline', 'brandColors', 'vibe',
    'websiteUrl', 'summary', 'summaryUpdatedAt', 'createdAt', 'updatedAt',
  ],
  brand_assets: [
    'id', 'brandProfileId', 'type', 'storageUrl', 'rawText',
    'originalFilename', 'mimeType', 'aiDescription', 'createdAt',
  ],
  brand_summary_versions: [
    'id', 'brandProfileId', 'summary', 'structuredData', 'changeReason', 'createdAt',
  ],
};

async function main() {
  loadEnv(resolve(import.meta.dirname, '../.env'));
  const prisma = new PrismaClient({ log: ['error'] });

  try {
    let failures = 0;

    for (const t of NEW_TABLES) {
      const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string; is_nullable: string }>>(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        t,
      );

      if (cols.length === 0) {
        console.error(`✗ table missing: ${t}`);
        failures++;
        continue;
      }

      const names = new Set(cols.map((c) => c.column_name));
      const missing = EXPECTED_COLUMNS[t].filter((c) => !names.has(c));
      if (missing.length > 0) {
        console.error(`✗ ${t} missing columns: ${missing.join(', ')}`);
        failures++;
        continue;
      }

      console.log(`✓ ${t} (${cols.length} columns)`);
    }

    // Confirm brandName still on users (the plan thought it didn't exist; it does).
    const userBrandName = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'brand_name'`,
    );
    if (userBrandName.length === 1) {
      console.log('✓ users.brand_name present');
    } else {
      console.error('✗ users.brand_name missing');
      failures++;
    }

    if (failures > 0) {
      console.error(`\n${failures} check(s) failed.`);
      process.exit(1);
    }
    console.log('\nAll schema checks passed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('check-schema failed:', err);
  process.exit(1);
});
