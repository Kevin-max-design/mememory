# MedMemory v0.1 recovery runbook

This runbook contains commands and control points, never credentials. Stop if the target project cannot be proved, a backup checksum fails, the restore target contains data, or any command would overwrite the active environment.

Platform references: [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [restore to a new project](https://supabase.com/docs/guides/platform/clone-project).

## Current recovery posture

- Staging project `ftshvrcaeqbxnewvkamj` is on Supabase Free and PITR is disabled as verified in the dashboard on 2026-09-15.
- A genuine PostgreSQL 18.6 custom-format logical backup of the `public` and `medmemory_migrations` schemas was created read-only on 2026-09-15 at 05:06:07 UTC. It is stored outside the repository with mode `0600`; size 315,105 bytes; SHA-256 `85e2eb2bea3995cc56c6293b435b98a897cb4d93428833a58ad2508d5ca55629`.
- `pg_restore --list` successfully read 238 archive entries, including both required schemas and 20 table-data entries. This proves archive readability, not restorability.
- The disposable restore drill remains blocked: Docker is unavailable and the locally installed Postgres.app server is not running. No restore was attempted against staging or another remote project.
- The Git migration set and private `medmemory_migrations.applied` ledger make application schema changes reproducible, but Git is not a data backup.
- Supabase database backups contain Storage metadata, not the private object bytes. Storage needs a separate encrypted backup and restore process.
- Preliminary RPO and RTO remain **UNKNOWN / NOT YET GUARANTEED** until backups are scheduled, Storage bytes are protected, and a timed isolated restore drill succeeds.

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

Use a server-side service identity and a manifest containing bucket, normalized path, size, MIME type, and SHA-256 digest. Never include signed URLs or keys. Restore into a private `medical-records` bucket only after the database restore, validate each path with the application ownership rules, upload without overwrite, compare digest and size, then sample through an authenticated owner request. Reconcile metadata rows against object bytes and quarantine mismatches. Supabase project cloning does not copy these object bytes or bucket settings.

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
