# MedMemory v0.1 production provisioning

This runbook prepares a clean production environment for release
`v0.1-beta.1`, commit `5cda705de0f9b181d47fd49a1f25e645545ef460`.
It must never target staging project `ftshvrcaeqbxnewvkamj`.

## Stop conditions

Stop before provisioning until the Git repository URL, Render workspace, production
domain, monitored support email, legal operator identity, legal jurisdiction, production
Supabase project reference, and deployment region are recorded in the private operations
system. Do not write those values into source files unless they are intentionally public.

Stop if any production Supabase URL or project reference equals the staging project. Stop
if the selected Render region and Supabase region have not been reviewed for latency and
data-residency requirements.

## Immutable release

1. Verify `git rev-parse 'v0.1-beta.1^{}'` returns the approved commit above.
2. Verify `v0.1-beta` still resolves to
   `50e44dd63c5a99c1f12953eb9dfe4afe173fb438`.
3. Push both annotated tags without force.
4. Create Render services from `deploy/render.yaml.example`, with auto-deploy disabled.
5. In each service, use **Manual Deploy → Deploy a specific commit** and enter the full
   approved commit SHA. Record Render's deployed commit for all three services.

The Blueprint is an operational template created after the release tag. It configures
services; it does not change the commit Render must build.

## Production Supabase

Create a new project in an approved organization and region. Enable account MFA for all
organization owners, SSL enforcement, appropriate network restrictions, backups, and
Security Advisor review. Do not import staging users, table data, or Storage objects.

Before schema installation, capture the new project's empty baseline. Store the database
password, publishable key, service-role key, and project reference only in approved secret
stores. Never place them in shell history, build logs, repository files, or support tools.

Parse and checksum each migration locally. Apply the following files in this order inside
one controlled initialization window:

| Migration | SHA-256 |
| --- | --- |
| `202609090001_foundation.sql` | `272759264cbfc85a6e6b0fc1a46b4fa90a2058fa2cb49742f09a3093935663eb` |
| `202609100001_auth_profile_bootstrap.sql` | `40f6ecde0fe415f0e21ce8edad3501eee2c5bd78a0cb16ff985513118159ecf6` |
| `202609100002_document_worker.sql` | `c377c7b9e3af1597169517493a6b3355bb63ef5187bc8c7fd3943286df106b5b` |
| `202609110001_structured_extraction.sql` | `c2a02e29fcba2a062627381f9f1cb6b7a6571d1cd8902a5754ee6dafaf02ab7b` |
| `202609110002_review_workflow.sql` | `f06a64f63aba1cdaae52e2dff29c4251dfc0eae9fff03e80c35656e7ca598884` |
| `202609120001_processing_resource_limits.sql` | `f305cfe8b4f2c0ab045fb1065cce03b915cac33f6cfce8b02723812893b546d1` |
| `202609140001_audit_log_append_only.sql` | `a3b1551ac201495cf207c35f8608b4632a734bf0abd2c4af7849f9948c6546ff` |
| `202609140002_rate_limiting.sql` | `d20aa7bdcf0346a1ff62a320ea55023a78a0336b30965bb560492750dfc948a4` |
| `202609140003_privacy_rate_limit.sql` | `72f0f24d6a279da96aefa5f933df435f326dff7f811ce5381884a46302cfa853` |
| `202609240001_account_deletion_guard.sql` | `308f5b69dd7b9a5098c67a96c8f01049cff786f0169daf3ea4d6a09d58f10b1d` |

Use a production-specific migration connection and ledger. The development scripts under
`scripts/database.py` and `scripts/generate-types.mjs` deliberately refuse any project
except staging and must not be modified or used for production initialization.

After application, verify one ledger row per migration and matching checksums. Verify all
expected tables, constraints, functions, triggers, grants, RLS flags, policies, indexes,
the private `medical-records` bucket, its MIME/size restrictions, and zero application,
Auth, and Storage rows.

## Auth configuration

Enable the Email provider. For the approved v0.1 immediate-session flow, disable Confirm
email. Configure the production site URL and exact redirect allowlist for the final HTTPS
domain. Keep password recovery available, set the minimum password length to at least 12,
review Auth rate limits, and configure CAPTCHA before opening public signup. Configure a
monitored custom SMTP provider before enabling password recovery for public users.

## Processor artifact

The processor image uses Python 3.10.16 and the hash-bearing `uv.lock` whose reviewed
SHA-256 is `1e263f5bed81e49644430a7b9713239e5fc69b369e84ae8f2f4d120cef135ce3`.
The approved PaddleOCR and OpenMed model weights are not stored in Git or in the current
container image. Before deployment:

1. Package the exact locally verified model directories as a private, checksum-addressed
   build artifact.
2. Scan the artifact, record model revisions and SHA-256 values, and make it available to
   the container build without exposing it publicly.
3. Copy models into a read-only image path; set `OPENMED_MODEL_DIR` to that path.
4. Build with network access, then run the final container with runtime egress denied.
5. Run synthetic PaddleOCR and OpenMed initialization/inference checks in the image.

Do not allow runtime model downloads. Do not set `ENABLE_OPENMED=true` or
`ENABLE_PADDLEOCR=true` until the matching local artifacts and smoke tests pass.

## Render verification

- Web: public service, `1c-2g`, one initial instance, `/api/ready` health check.
- Processor: private service only, `2c-8g`, one Uvicorn worker and one instance.
- Worker: background worker, `1c-2g`, one instance and 300-second shutdown window.
- All services: auto-deploy off; deploy only the approved commit.
- Web trusted address: `cf-connecting-ip`. Verify at the deployed edge that client input
  is overwritten before enabling public traffic.
- Processor secret: generated once by Render and shared to worker/web through service
  references; never copied into public variables.
- Verify processor has no public hostname and accepts authenticated private requests only.
- Verify resource metrics under a maximum-size synthetic document before launch.

## Promotion

Keep `NEXT_PUBLIC_ALLOW_INDEXING=false` through the production smoke. Promote only after
the smoke checklist passes, cleanup is proven, monitoring is active, and legal/contact
values are final. Changing indexing to `true` requires a controlled redeploy of the same
immutable release.
