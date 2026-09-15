# MedMemory v0.1 recovery runbook

This runbook contains commands and control points, never credentials. Stop if the target project cannot be proved, a backup checksum fails, the restore target contains data, or any command would overwrite the active environment.

Platform references: [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [restore to a new project](https://supabase.com/docs/guides/platform/clone-project).

## Current recovery posture

- Staging project `ftshvrcaeqbxnewvkamj` is on Supabase Free and PITR is disabled as verified in the dashboard on 2026-09-15.
- A genuine PostgreSQL 18.6 custom-format logical backup of the `public` and `medmemory_migrations` schemas was created read-only on 2026-09-15 at 05:06:07 UTC. It is stored outside the repository with mode `0600`; size 315,105 bytes; SHA-256 `85e2eb2bea3995cc56c6293b435b98a897cb4d93428833a58ad2508d5ca55629`.
- `pg_restore --list` successfully read 238 archive entries, including both required schemas and 20 table-data entries. This proves archive readability, not restorability.
- The archive was restored successfully on 2026-09-15 into disposable PostgreSQL 18.3 at `127.0.0.1:5433`; restore execution took 0.222 seconds. The target database was dropped after verification and the local cluster and backup were preserved.
- Restore verification matched all 19 public tables and their row counts, 99 portable constraints, 23 validated foreign keys, 8 migration ledger entries/checksums, RLS state for all tables, 19 policies, 12 function security signatures/configurations, and 74 indexes.
- PostgreSQL 18.3 represented 119 additional `NOT NULL` attributes as catalog constraints; all other constraint definitions matched. The restore used `--no-owner`: all 19 authenticated and 130 service-role table grants matched, while 133 staging `postgres` ownership-derived privileges became privileges of the disposable local owner. These are expected portability differences, with no extra grants.
- The Git migration set and private `medmemory_migrations.applied` ledger make application schema changes reproducible, but Git is not a data backup.
- Supabase database backups contain Storage metadata, not the private object bytes. Storage needs a separate encrypted backup and restore process.
- A synthetic Storage recovery drill completed on 2026-09-15. A 64-byte non-medical PDF was uploaded to the reserved service-only path `_recovery-test/<random-uuid>/synthetic.pdf`, downloaded, encrypted outside Git, deleted, restored without overwrite, checksummed, and deleted again. Source, backup, and restored SHA-256 were identical: `e587d02803e0321ef7edb3cfea442e2da4a918399b38e0bce88a71810eadb4d5`.
- The private bucket remained private and anonymous download was denied. The reserved path cannot satisfy the authenticated owner policy because it has no user UUID prefix or matching document row; recovery access therefore remains restricted to the server-side recovery identity. The bucket object count was 7 before and after, the reserved prefix returned to zero objects, and the Storage policy digest remained unchanged.
- Preliminary RPO and RTO remain **UNKNOWN / NOT YET GUARANTEED** until backups are scheduled, Storage bytes are protected, and the complete incident procedure is timed. The measured 0.222-second database restore execution is evidence for this small snapshot only and is not an operational RTO.

## Database backup

Use the official Supabase CLI backup flow from a restricted operator host with PostgreSQL, Docker, and the Supabase CLI installed. Build the database URL from a secret manager; never place it in shell history, source control, logs, or a process argument visible to other users.

Create three artifacts in a private directory outside the repository:

```text
roles.sql
schema.sql
data.sql
```

Run the official equivalents of `supabase db dump --role-only`, `supabase db dump` for schema, and `supabase db dump --data-only --use-copy`. Include the `medmemory_migrations` schema and the application, Auth, and Storage metadata schemas required by the selected Supabase restore procedure. Encrypt artifacts at rest, restrict permissions to the recovery operators, compute SHA-256 checksums, record UTC creation time and source project reference separately, and apply the retention policy.

Never commit dumps. Inspect only object names, counts, and checksums in verification output; do not print row contents.

## Database restore drill

Never restore onto active staging or production. Provision an empty disposable local Supabase stack or isolated Supabase project, then follow Supabase's documented roles, schema, and data restore order. Record tool and PostgreSQL versions.

Verify:

1. Every expected migration ledger row and checksum.
2. Tables, types, indexes, constraints, triggers, and extensions.
3. RLS enabled state and normalized policy-definition digest.
4. Function definitions, owners, `search_path`, and grants.
5. Table counts without printing medical contents.
6. Document-to-page/block/record/job relationships and foreign-key validation.
7. Append-only audit privileges and browser-role denial.
8. Rate-limit table/function permissions.

Destroy the disposable target after recording the signed drill report. A dump is not considered verified until this restore completes.

## Storage recovery

Database recovery restores only rows in `storage.objects`; it does not restore object bytes. Maintain a separate encrypted copy of both paths authorized by the application:

```text
{user_id}/{document_id}/original/{generated_filename}
{user_id}/{document_id}/normalized/{generated_filename}
```

Use a server-side service identity and an encrypted, off-host object-byte backup. Back up originals and normalized objects separately. The manifest must contain:

- normalized object path
- byte size
- MIME type
- SHA-256 digest
- UTC backup timestamp

Never include signed URLs, credentials, encryption keys, or object content in the manifest or logs. Keep encryption keys in a managed key service separate from the backup artifacts.

Restore into a private `medical-records` bucket only after the database restore:

1. Verify the target project and private bucket before any write.
2. Validate each manifest path against the application ownership rules and reconcile it with the owning database document.
3. Refuse an existing destination; never use overwrite or `upsert` during recovery.
4. Decrypt the backup in controlled memory, upload the bytes, and compare restored size and SHA-256 with the manifest.
5. Reconcile database rows and object paths in both directions. Quarantine missing, extra, or mismatched objects and escalate rather than deleting them automatically.
6. Sample access through the authenticated owner path and confirm anonymous and cross-owner access remain denied.
7. Remove only explicitly identified recovery-test objects and credentials. Record cleanup and investigate any residue.

The verified 2026-09-15 drill used an encrypted AES-256-GCM artifact under `/private/tmp/medmemory-storage-recovery`, outside Git, with file mode `0600`. Its ephemeral drill key was not persisted, so the artifact proves encrypted local handling but is not a usable retained operational backup. Supabase project cloning does not copy object bytes or bucket settings. Automated Storage backup, off-host retention, managed encryption-key custody, and a scheduled restore exercise are still required before assigning a guaranteed RPO or RTO.

## Worker recovery

- Stop workers before database or processor restoration.
- A processor timeout or unavailable response records a safe retryable code and requeues until `max_attempts`.
- Claims use a lock token and heartbeat. A stale processing claim becomes eligible after the database lock timeout; a worker that loses its claim cannot complete it.
- `attempt_count < max_attempts` prevents infinite retry; exhausted jobs become terminal `failed`.
- The partial unique index permits only one queued/processing job per document.
- Malformed or mismatched processor output fails before persistence.
- Completion uncertainty must be reconciled by reading the job/document state before retrying; never blindly write the response twice.
- After restart, run `npm run worker:documents -- --check-config`, inspect aggregate queued/processing/failed counts, then process one controlled job with `-- --once` before scaling workers.

## Database interruption

Upload persistence removes its object and document row when later creation fails; cleanup failure produces an explicit safe code for operator reconciliation. Search and Ask fail with stable codes and no input logging. Audit writes are non-blocking and emit only a safe code. Persistent rate-limit failure switches to a bounded per-instance fallback; alert on `rate_limit.degraded` because isolation is weaker across multiple instances.

Never test an outage by disabling staging. Use mocks or an isolated restore target.

## Deployment rollback

1. Freeze deployments and stop workers if database/processor contracts are involved.
2. Select the last immutable known-good commit and redeploy that artifact; do not rebuild a moving branch.
3. Confirm the older app is compatible with every forward migration already applied. Prefer a corrective forward migration when old code cannot tolerate the current schema.
4. Check `/api/health`, `/api/ready`, anonymous route protection, aggregate job states, and one synthetic owner-scoped smoke flow.
5. Resume one worker, observe a controlled job, then restore normal concurrency.

Rolling the app back does not roll the database or Storage back. Restoring an older database can discard newer writes and leave Storage bytes out of sync.

## Incident secret rotation

Rotate the Supabase service-role key, document-processor shared secret, and rate-limit HMAC secret through their platform secret stores. Redeploy every consumer together, validate health/readiness, and revoke old values. HMAC rotation starts new rate-limit identities. Do not place secret values in tickets or incident logs.

## Verification checklist

- Source and disposable target identities verified
- Backup artifacts encrypted, permission-restricted, checksummed, and off-repository
- Restore completed without ignored errors
- Schema, ledger, RLS, functions, grants, and counts match
- Storage metadata/object reconciliation passes
- Authenticated private-object sample passes
- Worker retries, stale claims, exhaustion, duplicates, and completion reconciliation pass
- Health/readiness and synthetic smoke flow pass
- Temporary targets, test objects, and credentials are removed

Escalate and stop for an unknown project reference, evidence of real-patient exposure, checksum mismatch, missing Storage bytes, privilege broadening, invalid foreign keys, unexplained count mismatch, or any restore command aimed at an active environment.
