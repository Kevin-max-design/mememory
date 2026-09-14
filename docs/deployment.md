# MedMemory v0.1 deployment runbook

## Required environment

Configure these values in the server environment. Use distinct random secrets per environment and never commit their values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server and worker only)
- `DOCUMENT_PROCESSOR_URL`
- `DOCUMENT_PROCESSOR_SECRET` (server and worker only, at least 32 characters)
- `RATE_LIMIT_HASH_SECRET` (server only, at least 32 random characters)

Optional Ask provider settings are `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. The application must remain useful when they are absent.

## Database migrations

Check the target Supabase project reference and migration status before every database change. Apply an explicitly approved migration once, in filename order. The current files are foundation, authentication profile bootstrap, document worker, structured extraction, review workflow, processing resource limits, audit append-only hardening, and rate limiting.

`202609100001_auth_profile_bootstrap.sql` remains pending and must not be included implicitly in a remote push. `202609140003_privacy_rate_limit.sql` is also pending explicit remote approval; it adds only the dedicated persistent export rate-limit scope. Apply migrations one at a time with the repository's targeted migration command and confirm the recorded version after each operation. Take a database backup before production schema changes.

## Build and deploy

1. Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` from the repository root.
2. Scan the browser build for server secrets and server-only imports.
3. Deploy an immutable commit using the hosting platform's production build command (`npm run build`) and start command (`npm start`).
4. Deploy the Python document processor separately with its pinned Python runtime and dependencies.
5. Start the document worker with `npm run worker:documents`; use `-- --check-config` before accepting jobs and `-- --once` for a controlled smoke run.

## Smoke checks

- `GET /api/health` returns 200 and `{ "ok": true, "status": "healthy" }`.
- `GET /api/ready` returns 200 only when required configuration and the minimal Supabase check succeed; 503 returns only `not_ready`.
- Verify anonymous dashboard/search access redirects to login.
- With a synthetic account, verify login, a small supported upload, worker completion, review, search, Ask evidence, preview, logout, and cleanup.
- Confirm structured logs contain request IDs, stable codes, duration, and opaque IDs only. Check that retries terminate at the configured maximum and stale claims recover.

## Rollback

Roll back the application to the previous immutable commit first. Stop workers before rolling back a processor contract. Database migrations are forward-only by default: restore from the verified backup or ship a reviewed corrective migration instead of reversing append-only audit or ownership controls in place. Confirm `/api/ready`, worker configuration, and queued-job counts after recovery.

## Secret rotation

Rotate the Supabase service-role key, processor shared secret, and rate-limit HMAC secret in the platform secret store. Redeploy all consumers together. Rotating the HMAC secret starts fresh rate-limit buckets; schedule it during a low-traffic window. Revoke the old value after health and smoke checks pass.

## Known v0.1 limits

- Readiness checks web configuration and Supabase connectivity; processor health is monitored with the processor's own health endpoint and worker alerts.
- Structured logs require the deployment platform to provide retention, alerting, and access controls.
- A strict Content Security Policy is deferred until signed Supabase previews and all deployment origins are enumerated and tested.
- In-process rate-limit fallback is per instance and exists only for database outages; persistent Supabase buckets are the production control.
- Deployment, database, and processor rollback remain operator-run procedures.
