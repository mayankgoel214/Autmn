# Storage TTL Cleanup Runbook

Nightly cron that enforces a retention window on Supabase storage buckets holding customer-supplied personal data. Required for DPDP Act §8(7) compliance — personal data must be deleted once the processing purpose has been fulfilled.

---

## What it does

A BullMQ repeating job (`STORAGE_CLEANUP` queue, registered in `apps/worker/src/index.ts`) runs once per day. Each invocation calls `cleanupBucketByAge` from `@autmn/storage` for every bucket in the configured list, deleting any object whose `created_at` is older than the bucket's retention window.

| Bucket | Retention | Why it's swept |
|---|---|---|
| `raw-images` | 30 days | Unaltered customer-supplied product photos. |
| `voice-notes` | 30 days | Transcription-input voice recordings. |
| `refund-reasons` | 30 days | Voice-note refund explanations. |

Buckets **NOT** swept by this job:

- `processed-images`, `cutouts`, `videos` — derived outputs the customer paid for. Future "Make a change" or re-deliver flows may re-use them.
- `brand-assets` — curated business content (logos, brand books). Not derivable from anything else.

If a future flow needs a different retention window for one of these, add an entry to `STORAGE_TTL_BUCKETS` in `apps/worker/src/index.ts`.

---

## Schedule

- **Cron**: `30 21 * * *` (21:30 UTC = 03:00 IST). Low-traffic window in our primary market.
- **Concurrency**: 1. We never want two sweeps in flight against the same bucket.
- **Retries**: BullMQ `attempts: 1`. The next scheduled run is effectively the retry — re-running inside the same window risks half-processing what the prior run was still mid-sweep on.
- **Lock duration**: 30 minutes. A very large bucket could plausibly take this long if Supabase is slow; if the worker would exceed this, BullMQ kills the job.

---

## Observability

Every run emits structured pino-compatible JSON events:

| Event | When | Fields |
|---|---|---|
| `storage_cleanup_scheduled` | Worker startup, after `upsertJobScheduler` | `cron`, `buckets: [{ bucket, maxAgeDays }]` |
| `=== STORAGE TTL CLEANUP START ===` | Each job entry | `bucketCount`, `buckets` |
| `storage_cleanup_complete` | Per bucket | `bucket`, `scanned`, `deleted`, `errors`, `skippedNoTimestamp`, `durationMs` |
| `storage_cleanup_batch_failed` | Per failed remove() batch | `bucket`, `batchSize`, `batchStartPath`, `error` |
| `storage_cleanup_bucket_failed` | If a whole bucket's sweep throws | `bucket`, `error` |
| `=== STORAGE TTL CLEANUP DONE ===` | After all buckets | `totalScanned`, `totalDeleted`, `totalErrors`, `perBucket: [CleanupBucketResult]` |
| `storage_cleanup_schedule_failed` | Scheduler `upsertJobScheduler` threw at boot | `error` |

When `SENTRY_DSN` is set, `storage_cleanup_bucket_failed` events also surface in Sentry via `captureException` (see `apps/worker/src/index.ts:storage_cleanup_scheduler`).

---

## Running it manually (incident response)

You'd want to run an out-of-band sweep when:
- An auditor asks for proof of DPDP retention.
- A user requests their data be deleted ahead of the 30-day window.
- The scheduled run was missed (worker crash / extended outage).

### Option A: enqueue an immediate job from the API

```bash
# From any machine with REDIS_URL set:
node -e "
const { getStorageCleanupQueue } = require('@autmn/queue');
const q = getStorageCleanupQueue();
q.add('storage-ttl-manual', {
  buckets: [
    { bucket: 'raw-images',     maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
    { bucket: 'voice-notes',    maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
    { bucket: 'refund-reasons', maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
  ],
}).then(() => console.log('queued'));
"
```

### Option B: per-bucket from a tsx script

```ts
import { cleanupBucketByAge } from '@autmn/storage';

const result = await cleanupBucketByAge(
  'raw-images',
  30 * 24 * 60 * 60 * 1000,
);
console.log(result);
```

### Option C: emergency wipe for a single user (right-to-be-forgotten)

The TTL job is age-based, not user-based. For a single-user purge, list the user's prefix directly via the Supabase storage UI or:

```ts
import { getStorageClient } from '@autmn/storage';

const client = getStorageClient();
const PHONE = '919XXXXXXXXX';
for (const bucket of ['raw-images', 'voice-notes', 'refund-reasons']) {
  const { data } = await client.storage.from(bucket).list(PHONE);
  if (data?.length) {
    await client.storage
      .from(bucket)
      .remove(data.map((d) => `${PHONE}/${d.name}`));
  }
}
```

---

## Validating a run worked

In the Bull Board (`/admin/queues`) or the worker logs, look for a `storage_cleanup_complete` event per bucket with:
- `errors` = 0 (per-batch deletes all succeeded)
- `skippedNoTimestamp` low or 0 (Supabase always populates `created_at` — non-zero here means schema drift)
- `deleted` > 0 if the bucket had >30-day content

A clean run with `deleted` = 0 across all three buckets is normal once steady-state is reached (anything customer-supplied today gets deleted ~30 days later).

---

## Adding a new bucket to the sweep

Edit `apps/worker/src/index.ts`:

```ts
const STORAGE_TTL_BUCKETS = [
  { bucket: 'raw-images',     maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
  { bucket: 'voice-notes',    maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
  { bucket: 'refund-reasons', maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
  // NEW:
  { bucket: 'your-bucket',    maxAgeMs: 14 * 24 * 60 * 60 * 1000 },
] as const;
```

Restart the worker — the schedule auto-updates via `upsertJobScheduler`.

---

## Smoke coverage

`scripts/smoke-phase-25.ts` exercises seven paths through `cleanupBucketByAge` against a mocked Supabase client:

- SC1: empty bucket
- SC2: all files within retention → no deletes
- SC3: mixed ages → only old files deleted
- SC4: nested folders (phone-number layout) → recursion works
- SC5: missing `created_at` → skipped, not deleted
- SC6: `remove()` returns an error → counted in `errors`
- SC7: > 1000 entries → pagination visits all pages

These cover the cleanup loop's behaviour but not the BullMQ scheduling or the live Supabase calls. The first scheduled run after a deploy is the real integration test — watch the logs for `storage_cleanup_complete` events.
