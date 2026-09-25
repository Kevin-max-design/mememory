# MedMemory v0.1 deployment runbook

## Required environment

Configure these values in the server environment. Use distinct random secrets per environment and never commit their values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (the canonical HTTPS origin)
- `NEXT_PUBLIC_SUPPORT_EMAIL` (a monitored public support address)
- `NEXT_PUBLIC_ALLOW_INDEXING` (`false` during private beta; set `true` only at public launch)
- `SUPABASE_SERVICE_ROLE_KEY` (server and worker only)
- `DOCUMENT_PROCESSOR_URL`
- `DOCUMENT_PROCESSOR_SECRET` (server and worker only, at least 32 characters)
- `RATE_LIMIT_HASH_SECRET` (server only, at least 32 random characters)
- `RATE_LIMIT_TRUSTED_PROXY_HEADER` (`cf-connecting-ip`, `x-real-ip`, or
  `x-forwarded-for`; the public edge must strip inbound copies and regenerate it)

`DOCUMENT_PROCESSOR_URL` must use HTTPS whenever it is not a loopback address.

Optional Ask provider settings are `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. The application must remain useful when they are absent.

## Database migrations

Check the target Supabase project reference and migration status before every database change. Apply an explicitly approved migration once, in filename order. The current files are foundation, authentication profile bootstrap, document worker, structured extraction, review workflow, processing resource limits, audit append-only hardening, and rate limiting.

Staging has applied the repository migrations through
`202609240001_account_deletion_guard.sql`, including
`202609100001_auth_profile_bootstrap.sql`.
Apply migrations one at a time with the targeted migration command and confirm the
recorded version after each operation. Take and restore-test a database backup before
production schema changes.

## Build and deploy

1. Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` from the repository root.
2. Scan the browser build for server secrets and server-only imports.
3. Deploy an immutable commit using the hosting platform's production build command (`npm run build`) and start command (`npm start`).
4. Deploy the Python document processor separately from
   `services/document-processor/Dockerfile`. It uses Python 3.10.16 and installs the
   hash-bearing `uv.lock` with `uv sync --frozen`; the clinical and Paddle OCR extras
   are included without any VLM dependency.
5. Start the document worker with `npm run worker:documents`; use `-- --check-config` before accepting jobs and `-- --once` for a controlled smoke run.

Do not move the `v0.1-beta` tag. Launch-facing changes must receive a new reviewed,
immutable tag after the checks in this document pass.

## Runtime isolation and capacity

Configure limits in the selected deployment platform and verify them under a synthetic
worst-case document before public traffic:

- Processor: one Uvicorn worker per container, one request at a time, 2 CPU minimum,
  6 GiB memory minimum, 10 GiB ephemeral disk maximum, read-only root filesystem with
  a bounded writable temporary directory, 120-second platform request deadline, and
  automatic restart on failed health checks.
- Document worker: one process initially, 1 CPU, 1 GiB memory, no public ingress, and a
  graceful termination window longer than its lease-renewal interval.
- Web: 1 CPU and 1 GiB memory per instance as an initial floor. Scale using latency,
  memory, and 5xx evidence rather than request count alone.
- Egress: web and worker may reach the configured Supabase and processor origins;
  processor egress is denied except for explicitly approved local model/runtime needs.
- Never mount model caches or writable host paths containing patient files into the web
  or worker service.

These values are starting bounds, not measured capacity promises. Record load-test
evidence before lowering memory or increasing processor concurrency.

## Smoke checks

- `GET /api/health` returns 200 and `{ "ok": true, "status": "healthy" }`.
- `GET /api/ready` returns 200 only when required configuration and the minimal Supabase check succeed; 503 returns only `not_ready`.
- Verify anonymous dashboard/search access redirects to login.
- Verify the deployed response includes `Content-Security-Policy`, HSTS,
  `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- With a synthetic account, verify login, a small supported upload, worker completion, review, search, Ask evidence, preview, logout, and cleanup.
- Confirm structured logs contain request IDs, stable codes, duration, and opaque IDs only. Check that retries terminate at the configured maximum and stale claims recover.

## Rollback

Roll back the application to the previous immutable commit first. Stop workers before rolling back a processor contract. Database migrations are forward-only by default: restore from the verified backup or ship a reviewed corrective migration instead of reversing append-only audit or ownership controls in place. Confirm `/api/ready`, worker configuration, and queued-job counts after recovery.

The current known-good checkpoint before recovery documentation is `1eba1079063957abb76670636bf84cd67b4fddf9`. See `docs/recovery.md` for database, Storage, worker, and incident procedures.

## Secret rotation

Rotate the Supabase service-role key, processor shared secret, and rate-limit HMAC secret in the platform secret store. Redeploy all consumers together. Rotating the HMAC secret starts fresh rate-limit buckets; schedule it during a low-traffic window. Revoke the old value after health and smoke checks pass.

## Known v0.1 limits

- Readiness checks web configuration and Supabase connectivity; processor health is monitored with the processor's own health endpoint and worker alerts.
- Structured logs require the deployment platform to provide retention, alerting, and access controls.
- The web app enforces a baseline Content Security Policy. Next.js currently requires
  `unsafe-inline` for its generated bootstrap/style output; replace this with the
  documented nonce-based Next.js pattern in a later hardening release.
- Production rate limiting fails closed with 503 when the shared PostgreSQL limiter is
  unavailable. The in-process limiter is development-only.
- The selected trusted proxy header is safe only when the deployment edge strips and
  regenerates it; verify this with a deployed spoofing test before public traffic.
- The processor enforces document-wide OCR budgets; platform CPU, memory, concurrency,
  temporary-disk, and egress limits must still be verified in the deployed environment.
- The Python lock is reproducible and hash-bearing, but the processor image still needs
  a clean Linux build and synthetic OCR smoke on the selected target architecture.
- The account-deletion guard is applied and verified on staging. Repeat the same
  targeted migration and concurrency verification before enabling production deletion.
- Deployment, database, and processor rollback remain operator-run procedures.
- Privacy Policy and Terms require review by counsel for the operator's identity,
  jurisdiction, governing law, subprocessors, and local health/privacy obligations.
