#!/usr/bin/env tsx
/**
 * Phase 25 smoke — Storage TTL cleanup (DPDP compliance).
 *
 * Exercises packages/storage/src/cleanup.ts with a hand-rolled mock of the
 * Supabase storage client. No real Supabase calls — just verifies the
 * cleanup loop's behaviour against synthetic inventories.
 *
 * Paths:
 *   SC1. Empty bucket → 0 scanned, 0 deleted, 0 errors.
 *   SC2. All files newer than cutoff → scanned but none deleted.
 *   SC3. Mixed ages → only old files appear in the remove() batch.
 *   SC4. Nested folders → traversal recurses + counts correctly.
 *   SC5. Missing created_at → counted as skippedNoTimestamp, NOT deleted.
 *   SC6. remove() returns an error → counted as errors, scanned still right.
 *   SC7. Pagination (> 1000 entries) → all pages visited.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(envPath: string): void {
  let contents: string;
  try { contents = readFileSync(envPath, 'utf-8'); } catch { process.exit(1); }
  for (const line of contents.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
loadEnv(resolve(import.meta.dirname, '../.env'));

const { cleanupBucketByAge } = await import('../packages/storage/dist/cleanup.js');

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; }
  else console.log(`  ✓ ${msg}`);
}

// ---------------------------------------------------------------------------
// Mock client — implements just the supabase.storage.from(...).list/remove
// surface that cleanupBucketByAge uses.
// ---------------------------------------------------------------------------

interface MockItem {
  name: string;
  /** ISO timestamp string, or null/undefined to simulate missing created_at. */
  created_at: string | null | undefined;
  /** null for folders, anything truthy for files. */
  metadata: object | null;
}

interface MockInventory {
  // Map prefix → list of items at that prefix. Empty prefix = root.
  [prefix: string]: MockItem[];
}

interface MockOpts {
  inventory: MockInventory;
  /** Paths whose remove() should fail. Tested as set membership. */
  removeFailures?: Set<string>;
}

function makeMockClient(opts: MockOpts) {
  const removedPaths: string[] = [];
  const listCalls: Array<{ prefix: string; offset: number }> = [];

  const client = {
    storage: {
      from: (_bucket: string) => ({
        list: async (
          prefix: string,
          { limit, offset }: { limit: number; offset: number; sortBy?: unknown },
        ) => {
          listCalls.push({ prefix, offset });
          const items = opts.inventory[prefix] ?? [];
          const page = items.slice(offset, offset + limit);
          return { data: page, error: null as null };
        },
        remove: async (paths: string[]) => {
          const conflict = paths.find((p) => opts.removeFailures?.has(p));
          if (conflict) {
            return { data: null, error: { message: `mock remove failed for ${conflict}` } };
          }
          for (const p of paths) removedPaths.push(p);
          return { data: paths.map((path) => ({ name: path })), error: null as null };
        },
      }),
    },
  };
  // Cast at the call site (cleanupBucketByAge expects a SupabaseClient).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, removedPaths, listCalls };
}

function days(n: number): number {
  return n * 24 * 60 * 60 * 1000;
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

// ---------------------------------------------------------------------------
// SC1 — Empty bucket
// ---------------------------------------------------------------------------

async function pathEmptyBucket(): Promise<void> {
  console.log('\n== Path SC1: empty bucket → no-op ==');
  const { client, removedPaths } = makeMockClient({ inventory: { '': [] } });
  const result = await cleanupBucketByAge('raw-images', days(30), client);
  assert(result.scanned === 0, `scanned 0 (got ${result.scanned})`);
  assert(result.deleted === 0, `deleted 0 (got ${result.deleted})`);
  assert(result.errors === 0, `errors 0 (got ${result.errors})`);
  assert(removedPaths.length === 0, 'remove() never called');
}

// ---------------------------------------------------------------------------
// SC2 — All files newer than cutoff
// ---------------------------------------------------------------------------

async function pathAllNew(): Promise<void> {
  console.log('\n== Path SC2: all files within retention → none deleted ==');
  const { client, removedPaths } = makeMockClient({
    inventory: {
      '': [
        { name: 'a.jpg', created_at: isoAgo(days(5)), metadata: { size: 100 } },
        { name: 'b.jpg', created_at: isoAgo(days(15)), metadata: { size: 100 } },
      ],
    },
  });
  const result = await cleanupBucketByAge('raw-images', days(30), client);
  assert(result.scanned === 2, `scanned 2 (got ${result.scanned})`);
  assert(result.deleted === 0, `deleted 0 (got ${result.deleted})`);
  assert(removedPaths.length === 0, 'remove() never called');
}

// ---------------------------------------------------------------------------
// SC3 — Mixed ages
// ---------------------------------------------------------------------------

async function pathMixedAges(): Promise<void> {
  console.log('\n== Path SC3: mixed ages → only old files deleted ==');
  const { client, removedPaths } = makeMockClient({
    inventory: {
      '': [
        { name: 'fresh.jpg', created_at: isoAgo(days(2)), metadata: { size: 100 } },
        { name: 'stale.jpg', created_at: isoAgo(days(45)), metadata: { size: 100 } },
        { name: 'ancient.jpg', created_at: isoAgo(days(365)), metadata: { size: 100 } },
        { name: 'borderline.jpg', created_at: isoAgo(days(29)), metadata: { size: 100 } },
      ],
    },
  });
  const result = await cleanupBucketByAge('raw-images', days(30), client);
  assert(result.scanned === 4, `scanned 4 (got ${result.scanned})`);
  assert(result.deleted === 2, `deleted 2 (got ${result.deleted})`);
  assert(removedPaths.includes('stale.jpg'), 'stale.jpg removed');
  assert(removedPaths.includes('ancient.jpg'), 'ancient.jpg removed');
  assert(!removedPaths.includes('fresh.jpg'), 'fresh.jpg preserved');
  assert(!removedPaths.includes('borderline.jpg'), 'borderline.jpg (29d) preserved');
}

// ---------------------------------------------------------------------------
// SC4 — Nested folders
// ---------------------------------------------------------------------------

async function pathNestedFolders(): Promise<void> {
  console.log('\n== Path SC4: nested folders → recursion finds + deletes ==');
  const { client, removedPaths } = makeMockClient({
    inventory: {
      '': [
        // Folder entries have metadata === null.
        { name: '919999000001', created_at: isoAgo(days(1)), metadata: null },
        { name: '919999000002', created_at: isoAgo(days(1)), metadata: null },
      ],
      '919999000001': [
        { name: 'photo-old.jpg', created_at: isoAgo(days(60)), metadata: { size: 100 } },
        { name: 'photo-new.jpg', created_at: isoAgo(days(5)), metadata: { size: 100 } },
      ],
      '919999000002': [
        { name: 'voice-old.ogg', created_at: isoAgo(days(90)), metadata: { size: 100 } },
      ],
    },
  });
  const result = await cleanupBucketByAge('voice-notes', days(30), client);
  assert(result.scanned === 3, `scanned 3 file entries (got ${result.scanned})`);
  assert(result.deleted === 2, `deleted 2 (got ${result.deleted})`);
  assert(
    removedPaths.includes('919999000001/photo-old.jpg'),
    'nested photo-old.jpg removed',
  );
  assert(
    removedPaths.includes('919999000002/voice-old.ogg'),
    'nested voice-old.ogg removed',
  );
  assert(
    !removedPaths.includes('919999000001/photo-new.jpg'),
    'nested photo-new.jpg preserved',
  );
}

// ---------------------------------------------------------------------------
// SC5 — Missing created_at
// ---------------------------------------------------------------------------

async function pathMissingTimestamp(): Promise<void> {
  console.log('\n== Path SC5: missing created_at → skipped, not deleted ==');
  const { client, removedPaths } = makeMockClient({
    inventory: {
      '': [
        { name: 'no-ts.jpg', created_at: null, metadata: { size: 100 } },
        { name: 'bad-ts.jpg', created_at: 'not-a-date', metadata: { size: 100 } },
        { name: 'real-old.jpg', created_at: isoAgo(days(60)), metadata: { size: 100 } },
      ],
    },
  });
  const result = await cleanupBucketByAge('raw-images', days(30), client);
  assert(result.scanned === 3, `scanned 3 (got ${result.scanned})`);
  assert(result.skippedNoTimestamp === 2, `skippedNoTimestamp 2 (got ${result.skippedNoTimestamp})`);
  assert(result.deleted === 1, `deleted 1 (got ${result.deleted})`);
  assert(removedPaths.length === 1 && removedPaths[0] === 'real-old.jpg', 'only real-old.jpg removed');
}

// ---------------------------------------------------------------------------
// SC6 — Delete batch fails
// ---------------------------------------------------------------------------

async function pathRemoveError(): Promise<void> {
  console.log('\n== Path SC6: remove() error → counted in errors, scanned unchanged ==');
  const { client } = makeMockClient({
    inventory: {
      '': [
        { name: 'old1.jpg', created_at: isoAgo(days(60)), metadata: { size: 100 } },
        { name: 'old2.jpg', created_at: isoAgo(days(60)), metadata: { size: 100 } },
      ],
    },
    removeFailures: new Set(['old1.jpg']),
  });
  const result = await cleanupBucketByAge('raw-images', days(30), client);
  assert(result.scanned === 2, `scanned 2 (got ${result.scanned})`);
  // Both old files were in one batch; the batch failed → errors += 2.
  assert(result.errors === 2, `errors 2 (got ${result.errors})`);
  assert(result.deleted === 0, `deleted 0 (batch failed, got ${result.deleted})`);
}

// ---------------------------------------------------------------------------
// SC7 — Pagination
// ---------------------------------------------------------------------------

async function pathPagination(): Promise<void> {
  console.log('\n== Path SC7: > 1000 entries → all pages visited ==');
  // 1500 old files at root. Pagination kicks in at limit=1000.
  const root: MockItem[] = [];
  for (let i = 0; i < 1500; i++) {
    root.push({
      name: `f-${i}.jpg`,
      created_at: isoAgo(days(60)),
      metadata: { size: 100 },
    });
  }
  const { client, listCalls, removedPaths } = makeMockClient({
    inventory: { '': root },
  });
  const result = await cleanupBucketByAge('raw-images', days(30), client);
  assert(result.scanned === 1500, `scanned 1500 (got ${result.scanned})`);
  assert(result.deleted === 1500, `deleted 1500 (got ${result.deleted})`);
  // 2 list calls expected: offset 0 returns 1000, offset 1000 returns 500.
  assert(listCalls.length === 2, `list called twice for pagination (got ${listCalls.length})`);
  assert(listCalls[0]!.offset === 0, 'first list offset 0');
  assert(listCalls[1]!.offset === 1000, 'second list offset 1000');
  // 2 remove batches expected: 1000 + 500.
  assert(removedPaths.length === 1500, 'all 1500 paths recorded');
}

async function main(): Promise<void> {
  console.log('Phase 25 smoke — Storage TTL cleanup\n');
  await pathEmptyBucket();
  await pathAllNew();
  await pathMixedAges();
  await pathNestedFolders();
  await pathMissingTimestamp();
  await pathRemoveError();
  await pathPagination();
  if (failures === 0) {
    console.log('\nPASS — all Phase 25 smoke assertions green.');
    process.exit(0);
  } else {
    console.error(`\nFAIL — ${failures} assertion(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => { console.error('Smoke test crashed:', err); process.exit(1); });
