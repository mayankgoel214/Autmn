/**
 * Storage TTL cleanup — DPDP compliance.
 *
 * Recursively lists objects in a Supabase storage bucket, identifies any
 * whose `created_at` is older than the supplied retention window, and
 * batch-deletes them. Returns counts for observability.
 *
 * Why this exists:
 *   - DPDP Act §8(7) requires deletion of personal data once the
 *     processing purpose has been fulfilled.
 *   - Customer-supplied photos, voice notes, and refund-reason
 *     recordings are personal data. Holding them indefinitely is a
 *     compliance liability.
 *   - Derived outputs (processed-images, cutouts) are excluded by
 *     default — they're business artefacts the user paid for, and
 *     deleting them would remove evidence of the order itself.
 *
 * Failure mode:
 *   - List failures (network / Supabase outage) throw — the caller
 *     (BullMQ worker) sees the error and retries per its backoff policy.
 *   - Per-batch delete failures are counted in `errors` but do not abort
 *     the rest of the cleanup. A partial run is better than no run.
 *
 * Performance:
 *   - Each page is a single list() call (limit 1000) so a bucket with N
 *     objects costs roughly N/1000 list calls + ceil(deleted/1000)
 *     remove calls. Nightly batch — latency isn't a concern.
 *
 * Layout assumption:
 *   - Buckets used in this codebase use a flat phone-number-prefixed
 *     layout (e.g. raw-images/919XXXXXXXXX/${timestamp}.jpg). The
 *     traversal is recursive so deeper nesting works too.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStorageClient } from './client.js';

export interface CleanupBucketResult {
  bucket: string;
  /** Total file objects examined (folder entries excluded from this count). */
  scanned: number;
  /** Files successfully deleted. */
  deleted: number;
  /** Files we intended to delete but Supabase rejected. */
  errors: number;
  /** Files that passed the cutoff check but had no parseable created_at. */
  skippedNoTimestamp: number;
  /** Wall-clock duration for the entire bucket sweep. */
  durationMs: number;
}

/** Maximum entries Supabase storage.list() returns per call. */
const LIST_PAGE_SIZE = 1000;
/** Maximum paths Supabase storage.remove() accepts per call. */
const REMOVE_BATCH_SIZE = 1000;

/**
 * Delete every object in `bucket` whose `created_at` is older than
 * `maxAgeMs` milliseconds before now.
 *
 * @param bucket    The Supabase storage bucket name (e.g. 'raw-images').
 * @param maxAgeMs  Retention window in milliseconds — objects older than
 *                  `Date.now() - maxAgeMs` are deleted.
 * @param client    Optional injected Supabase client. Pass a mock from
 *                  smoke tests; production callers should omit and let
 *                  the function use the singleton from client.ts.
 */
export async function cleanupBucketByAge(
  bucket: string,
  maxAgeMs: number,
  client?: SupabaseClient,
): Promise<CleanupBucketResult> {
  const startMs = Date.now();
  const supabase = client ?? getStorageClient();
  const cutoff = Date.now() - maxAgeMs;

  const toDelete: string[] = [];
  let scanned = 0;
  let skippedNoTimestamp = 0;

  // Recursive depth-first traversal. Supabase storage list() distinguishes
  // folders from files by metadata === null (folder) vs metadata.size (file).
  async function listFolder(prefix: string): Promise<void> {
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        // Returning oldest first means we can early-exit a folder once we
        // hit something younger than the cutoff. Newer Supabase clients
        // accept sortBy; older ones ignore it harmlessly.
        sortBy: { column: 'created_at', order: 'asc' },
      });

      if (error) {
        throw new Error(
          `cleanupBucketByAge list failed (bucket=${bucket}, prefix=${prefix}): ${error.message}`,
        );
      }
      if (!data || data.length === 0) break;

      for (const item of data) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

        // Folders surface with metadata === null in the Supabase storage
        // list response. Recurse into them.
        if (item.metadata === null || item.metadata === undefined) {
          await listFolder(fullPath);
          continue;
        }

        scanned++;
        const createdAtRaw = item.created_at ?? null;
        if (!createdAtRaw) {
          // Defensive — Supabase always populates created_at, but if it
          // ever doesn't we'd rather skip than delete a possibly-recent
          // file with no proof of age.
          skippedNoTimestamp++;
          continue;
        }
        const createdAtMs = new Date(createdAtRaw).getTime();
        if (Number.isNaN(createdAtMs)) {
          skippedNoTimestamp++;
          continue;
        }
        if (createdAtMs < cutoff) {
          toDelete.push(fullPath);
        }
      }

      if (data.length < LIST_PAGE_SIZE) break;
      offset += LIST_PAGE_SIZE;
    }
  }

  await listFolder('');

  // Batch delete in chunks. A single batch failure is logged but doesn't
  // abort the cleanup — partial progress beats no progress.
  let deleted = 0;
  let errors = 0;
  for (let i = 0; i < toDelete.length; i += REMOVE_BATCH_SIZE) {
    const batch = toDelete.slice(i, i + REMOVE_BATCH_SIZE);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      errors += batch.length;
      console.warn(
        JSON.stringify({
          event: 'storage_cleanup_batch_failed',
          bucket,
          batchSize: batch.length,
          batchStartPath: batch[0],
          error: error.message,
        }),
      );
    } else {
      deleted += batch.length;
    }
  }

  const result: CleanupBucketResult = {
    bucket,
    scanned,
    deleted,
    errors,
    skippedNoTimestamp,
    durationMs: Date.now() - startMs,
  };

  console.info(
    JSON.stringify({
      event: 'storage_cleanup_complete',
      ...result,
    }),
  );

  return result;
}
