/**
 * One-time script: create all required Supabase storage buckets as public.
 *
 * Run:
 *   cd /Users/lending/Autmn && npx tsx scripts/create-buckets.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Manual .env loader — avoids dotenv package dependency in scripts/
function loadEnv(envPath: string): void {
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf-8');
  } catch {
    console.error(`Could not read ${envPath}`);
    return;
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

loadEnv(resolve(import.meta.dirname, '../.env'));

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Matches Buckets constant in packages/storage/src/buckets.ts.
// brand-assets is PRIVATE (signed URLs only); all others are public-read.
const buckets: Array<{ name: string; public: boolean }> = [
  { name: 'raw-images', public: true },
  { name: 'processed-images', public: true },
  { name: 'voice-notes', public: true },
  { name: 'cutouts', public: true },
  { name: 'videos', public: true },
  { name: 'brand-assets', public: false },
];

async function main() {
  console.log(`Connecting to: ${supabaseUrl}\n`);

  for (const bucket of buckets) {
    const { error } = await supabase.storage.createBucket(bucket.name, {
      public: bucket.public,
    });
    if (error) {
      if (error.message.toLowerCase().includes('already exists')) {
        console.log(`${bucket.name}: already exists (skipped)`);
      } else {
        console.error(`${bucket.name}: ERROR — ${error.message}`);
      }
    } else {
      console.log(`${bucket.name}: created (public: ${bucket.public})`);
    }
  }

  // Verify all buckets are present
  const { data: list, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error('\nFailed to list buckets:', listError.message);
    process.exit(1);
  }
  console.log('\nAll buckets now present:');
  for (const b of list ?? []) {
    console.log(`  - ${b.name} (public: ${b.public})`);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
