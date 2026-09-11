# Engineering checkpoints

## Phase 0 — Discovery
STATUS: PASS
IMPLEMENTED: inspected empty workspace, tools, Git boundary; isolated project repository.
FILES CHANGED: docs/architecture.md, docs/product-brief.txt.
COMMANDS RUN: pwd, ls -la, git status, git branch, runtime version checks.
TEST RESULTS: not applicable.
ISSUES FOUND: inherited home-directory repository; no Docker or Supabase CLI.
FIXES APPLIED: initialized isolated codex/medmemory branch here.
REMAINING LIMITATIONS: database configuration absent.
NEXT PHASE: foundation.

## Phase 1 — Foundation
STATUS: PASS
IMPLEMENTED: npm workspace; Next.js 16.3.4, React, strict TypeScript, Tailwind;
ESLint, Vitest, Prettier; FastAPI, Pydantic settings, internal health auth, Ruff, pytest;
mandatory server environment validation; architecture and setup documentation.
FILES CHANGED: root package files, apps/web, services/document-processor,
scripts/smoke-foundation.py, README.md, .env.example, .gitignore, docs.
COMMANDS RUN: npm dependency installs; pip editable dev install; npm run lint;
npm run typecheck; npm test; npm run build --workspace apps/web -- --webpack;
.venv/bin/ruff check .; .venv/bin/pytest; python3 scripts/smoke-foundation.py.
TEST RESULTS: lint PASS, typecheck PASS, Vitest 3 PASS, Ruff PASS, pytest 2 PASS,
Webpack production build PASS, both live HTTP startup checks PASS.
ISSUES FOUND: sandbox DNS/install denial and port denial; Turbopack CSS worker port
failure persisted on approved retry; Python dependency deprecation warnings.
FIXES APPLIED: approved dependency and smoke execution; supported Webpack builder
selected in build script; no external font dependency.
REMAINING LIMITATIONS: synthetic smoke configuration verifies startup only, not Supabase;
no patient workflows, OCR, worker, database migrations, RLS or E2E tests yet.
NEXT PHASE: database/security foundation. User requested a new development Supabase
project after initially choosing an existing one. Dashboard redirected to sign-in;
waiting for user sign-in in the open browser panel. No project created yet.

## Phase 2 — Database and security foundation
STATUS: PASS
IMPLEMENTED: initial 18-table migration, enums, indexes, ownership foreign keys,
provenance trigger, RLS, explicit grants, private storage bucket/policy;
transactional checksum migration runner and rollback-only database security tests.
FILES CHANGED: supabase/migrations/202609090001_foundation.sql, supabase/seed.sql,
scripts/database.py, scripts/database_security.py, scripts/requirements.txt,
docs/data-model.md, docs/security.md, docs/operations.md.
COMMANDS RUN: database.py validate/apply/inspect/test; Supabase type generation;
Ruff; web lint, typecheck, tests and production build; npm audit; secret scan.
TEST RESULTS: migration committed; all 18 public patient tables report RLS enabled;
private 20 MiB medical-records bucket verified; owner access passed; cross-user
select/update/delete/insert denied; anonymous access denied; mismatched child ownership
rejected; all rollback-only fixtures removed. Generated types cover 18 tables. Web lint,
typecheck, 3 tests and production build PASS; Ruff and 2 Python tests PASS; npm audit
reports zero vulnerabilities.
ISSUES FOUND: Node did not trust the pooler's presented certificate chain by default.
The initially installed full metadata server also introduced unnecessary advisories.
FIXES APPLIED: used Supabase's official CA with verification enabled and replaced the
metadata server with Supabase's smaller type-generation library; npm audit is clean.
REMAINING LIMITATIONS: Auth API and Storage API integration tests remain for later phases.
The dashboard does not list this migration in Supabase's CLI migration history because
the repository uses its own checksum ledger in medmemory_migrations.
NEXT PHASE: authentication.

## Phase 3 — Authentication
STATUS: BLOCKED
IMPLEMENTED:
- Supabase SSR browser/server clients with strict separation.
- Next.js proxy session refresh using verified claims.
- Signup, login, logout, confirmation callback, protected dashboard, safe redirects.
- Server-side authorization uses a fresh Auth user lookup before patient data access.
- Friendly bounded error mapping; upstream details are not exposed.
- Existing deployed auth.users trigger bootstraps a profile row.
- Pending migration improves bootstrap by copying bounded full-name metadata.
FILES CHANGED:
- apps/web/src/app/auth, dashboard, login, signup
- apps/web/src/components/auth-form.tsx
- apps/web/src/features/auth
- apps/web/src/lib/supabase
- apps/web/src/server/auth, apps/web/src/proxy.ts
- apps/web/src/test/auth*.test.ts, logout.test.ts, vitest.config.mts
- supabase/migrations/202609100001_auth_profile_bootstrap.sql
- scripts/database.py, scripts/database_security.py, package files and docs
COMMANDS RUN:
- git ignore/checkpoint checks; database inspection over verify-full TLS
- web formatter, lint, typecheck, Vitest, production build
- live local request to /dashboard; browser-asset secret scan
- attempted remote migration and rollback-only profile security test
TEST RESULTS:
- Preflight PASS: intended project ref, rotated connection, verified TLS, private bucket.
- Web lint PASS; typecheck PASS; 12 tests PASS across 4 files.
- Production build PASS with six routes and active Proxy.
- Anonymous live /dashboard request PASS: 307 to /login?error=auth_required.
- Browser assets PASS: no database password, service-role variable, or secret-key prefix.
- Authenticated hosted route, logout against hosted Auth, and new profile assertion NOT RUN.
ISSUES FOUND:
- Automatic approval review classifies the remote default branch label `main PRODUCTION`
  as production even though the project is named medmemory-dev and was created for this task.
FIXES APPLIED:
- No remote workaround attempted. All unaffected local implementation and checks completed.
REMAINING LIMITATIONS:
- Remote auth acceptance and profile-bootstrap migration require explicit authorization
  acknowledging the dashboard branch label. Hosted confirmation template is not configured.
NEXT PHASE:
- Complete remote Phase 3 gates. Do not begin Phase 4 until Phase 3 passes.

## Phase 4 — Secure storage and upload
STATUS: PASS
IMPLEMENTED: authenticated PDF/JPEG/PNG/WEBP upload endpoint and dashboard; private
storage; byte/MIME/extension validation; 20 MiB limit; generated paths; SHA-256;
document and queued-job persistence; compensating cleanup with explicit errors.
FILES CHANGED: apps/web/src/app/api/documents/route.ts, dashboard/page.tsx,
components/document-upload.tsx, features/documents, lib/supabase/admin.ts, upload tests.
COMMANDS RUN: npm test; npm run lint; npm run typecheck; npm run build; anonymous curl
upload; read-only Supabase document/job verification; browser bundle secret scan;
gitignore and diff checks.
TEST RESULTS: 23 tests in 6 files PASS; lint, typecheck and production build PASS;
anonymous upload rejected with HTTP 401; live PDF and JPEG uploads PASS; 2 queued
documents and 2 queued jobs verified; all paths and document-job relationships valid.
ISSUES FOUND: remote project default branch remains labeled `main PRODUCTION`.
FIXES APPLIED: server-only secret client; private UUID paths; rollback for each failure
after object creation; no privileged key in browser output.
REMAINING LIMITATIONS: PNG/WEBP covered synthetically rather than by remote writes;
OCR and worker integration intentionally absent; pending auth migration not applied.
NEXT PHASE: isolated stateless document processor using synthetic fixtures only.

## Phase 5 — Document processor
STATUS: PASS
IMPLEMENTED: authenticated FastAPI health and analyze endpoints; strict Pydantic
contracts; base64 payload and size validation; page-level PyMuPDF native extraction;
Tesseract OCR abstraction; scanned PDF fallback; EXIF correction; grayscale, conditional
CLAHE and conservative deskew; text blocks with confidence and bounding boxes; provider
metadata; bounded rendering and stable error responses.
FILES CHANGED: services/document-processor/app/main.py, errors.py, schemas.py,
preprocessing.py, ocr.py, processor.py, app/tests, pyproject.toml, README.md,
docs/checkpoints.md.
COMMANDS RUN: editable processor dependency install; .venv/bin/pytest;
.venv/bin/ruff check .; git diff --check.
TEST RESULTS: 15 tests PASS; Ruff PASS. Tests cover health authentication, native PDF,
image OCR, scanned PDF OCR, mixed page decisions, unsupported type, malformed PDF,
zero bytes, MIME mismatch, unavailable OCR provider, response schema, absence of canned
medical data, EXIF correction and geometry preservation.
ISSUES FOUND: the initial dependency install was blocked by sandbox DNS and succeeded
after the approved network retry. Python 3.14 emits upstream PyMuPDF SWIG and TestClient
deprecation warnings.
FIXES APPLIED: installed isolated OCR dependencies; normalized all service errors;
enforced decoded-byte, page-count and rendered-pixel limits; retained internal shared-
secret authentication.
REMAINING LIMITATIONS: English is the Tesseract default; preprocessing does not persist
a normalized image; no worker, Supabase access, job claiming or result persistence;
the endpoint accepts internal base64 payloads and is not wired to uploaded documents.
NEXT PHASE: persistence/job worker integration, only after explicit instruction.

## Phase 6 — Job worker and processing orchestration
STATUS: PASS
IMPLEMENTED: DB-backed document worker with atomic targeted/general claims, lock-token
renewal, bounded retries, stale-lock recovery, private object retrieval, SHA-256 and size
revalidation, authenticated processor calls, strict response validation, transactional
page/block persistence, idempotent completion, and explicit safe failures. Added a
single-job synthetic integration harness with cleanup and a migration runner option that
can apply one exact filename without applying other pending migrations.
FILES CHANGED: apps/web/src/workers/document-worker.ts, documents.ts, e2e.ts;
apps/web/src/test/document-worker.test.ts; apps/web/src/types/database.types.ts;
supabase/migrations/202609100002_document_worker.sql; scripts/database.py;
scripts/document_worker_database.py; processor schema/preprocessing files; package files;
README.md; docs/checkpoints.md.
COMMANDS RUN: database.py verify; document_worker_database.py; npm run test:worker:e2e;
npm test; npm run lint; npm run typecheck; npm run build; processor pytest; Ruff;
git diff --check.
TEST RESULTS: worker migration recorded applied; auth migration remains pending. Five
rollback-only database checks PASS. Synthetic native-PDF pipeline PASS with one page and
one block, document needs_review, job completed, attempt count one. Cleanup restored the
baseline: 2 users, 2 storage objects, 2 queued documents, 2 queued jobs, zero pages and
zero blocks. Existing queued jobs remained queued. Web 30 tests PASS; lint, typecheck and
production build PASS. Processor 15 tests PASS; Ruff PASS.
ISSUES FOUND: project remains on a dashboard branch labeled main PRODUCTION, though the
user explicitly confirmed it is the intended development/staging project with synthetic
data only. Python dependencies emit seven upstream deprecation warnings.
FIXES APPLIED: restricted worker functions to service_role; targeted the E2E claim by its
generated job UUID; fixed the privilege test with a savepoint; verified cleanup using a
database-enforced read-only TLS session and aggregate counts only.
REMAINING LIMITATIONS: worker is a command process and still needs an external supervisor
for deployment; processor payloads are base64 and memory-bound; English Tesseract is the
default; structured medical extraction, review UI, and production orchestration are out
of scope. The authentication migration remains pending.
NEXT PHASE: stop. Do not begin Phase 7 without explicit instruction.

## Phase 7 — Structured medical extraction
STATUS: PASS
IMPLEMENTED: deterministic, versioned provider abstraction for labs, medications,
explicit diagnoses, explicit allergies, vitals, procedures, and labelled doctor notes;
stable SHA-256 fingerprints; confidence; mandatory document/page/block provenance;
optional unavailable-safe Ollama interface; atomic OCR plus extraction persistence;
service-role-only execution; idempotent completion; protection for reviewed records.
FILES CHANGED: apps/web/src/features/extraction; apps/web/src/test/extraction.test.ts;
apps/web/src/workers/document-worker.ts, documents.ts, e2e.ts;
apps/web/src/types/database.types.ts; scripts/document_worker_database.py;
supabase/migrations/202609110001_structured_extraction.sql; README.md;
docs/checkpoints.md.
COMMANDS RUN: database.py verify; database.py apply --only
202609110001_structured_extraction.sql; document_worker_database.py;
npm run test:worker:e2e; npm test; npm run lint; npm run typecheck; npm run build;
processor pytest; Ruff; migration parse; browser-bundle secret scan; git diff --check.
TEST RESULTS: 40 web tests PASS; 15 processor tests PASS; lint, typecheck, build,
Ruff, migration parsing, and secret scan PASS. Seven rollback-only DB checks PASS.
One isolated native-PDF integration produced 1 page, 7 blocks, and 10 extracted records
covering lab, medication, diagnosis, allergy, vital, and procedure records. Provenance
and fingerprints verified; document remained needs_review; job completed.
ISSUES FOUND: the first E2E launch stopped before remote writes because standalone tsx
could not resolve a runtime path alias. Python dependencies emit seven upstream
deprecation warnings.
FIXES APPLIED: changed the extraction runtime import to a relative path; rerun passed.
The targeted migration alone was applied. Cleanup restored 2 users, 2 storage objects,
2 queued documents, 2 queued jobs, and zero page/block/medical/child extraction rows.
The pre-existing jobs remained queued and the authentication migration remains pending.
REMAINING LIMITATIONS: deterministic patterns cover common labelled formats rather than
all clinical documents; dates and complex multi-block relationships remain conservative;
Ollama is an unavailable-safe interface only; English OCR is the default; no review UI,
Ask MedMemory, or Doctor Brief exists yet.
NEXT PHASE: stop. Do not begin Phase 8 without explicit instruction.

## Phase 8 — Review UI and source provenance
STATUS: PASS
IMPLEMENTED: authenticated records list, record detail, and two-column review routes;
exact page/block source display; grouped extraction candidates; confidence and review
status labels; approve, reject, and corrections for labs, medications, diagnoses,
allergies, vitals, procedures, and doctor notes. A strict Zod API and authenticated,
owner-scoped database function preserve provenance and update document status atomically.
FILES CHANGED: apps/web/src/app/records; apps/web/src/app/api/records;
apps/web/src/components/review-workspace.tsx; apps/web/src/features/medical-records;
apps/web/src/app/dashboard/page.tsx; apps/web/src/test/review-schema.test.ts;
apps/web/src/types/database.types.ts; apps/web/src/workers/e2e.ts, documents.ts;
scripts/review_database.py; supabase/migrations/202609110002_review_workflow.sql;
docs/checkpoints.md.
COMMANDS RUN: database.py verify; database.py apply --only
202609110002_review_workflow.sql; review_database.py; npm run test:worker:e2e -- --review;
npm test; npm run lint; npm run typecheck; npm run build; pytest; Ruff;
migration parsing; browser bundle secret scan; git diff --check.
TEST RESULTS: 44 web tests PASS; 15 processor tests PASS; lint, typecheck, build,
Ruff, migration parse, secret scan, and diff check PASS. Rollback tests confirmed
cross-user denial, provenance preservation, correction persistence, and document-state
transitions. Live verification reviewed 10 generated candidates: the document remained
needs_review with one extracted candidate, then became completed after the final
correction. Corrected provenance was unchanged.
ISSUES FOUND: no security or integration defects remained. Python dependencies emit
seven upstream deprecation warnings.
FIXES APPLIED: added authenticated transactional review RPC and strict client payload
schemas; no ownership, document, or provenance fields are client-editable. Synthetic
cleanup restored 2 users, 2 storage objects, 2 queued documents, 2 queued jobs, and zero
page/block/medical/child rows. Existing jobs remained queued. Auth migration is pending.
REMAINING LIMITATIONS: source display highlights text blocks but does not overlay the
original PDF/image; activity shows upload metadata rather than a full audit history;
review corrections cover the requested core fields and omit advanced clinical coding.
NEXT PHASE: stop. Do not begin Phase 9 without explicit instruction.

## Phase 9 — Medical timeline
STATUS: PASS
IMPLEMENTED: authenticated dynamic medical timeline, dashboard shortcut and recent
events, newest-first ordering, category filters, text search, category/status badges,
source document links, and provenance links. Trusted events include only approved or
corrected facts; document events remain clearly distinct.
FILES CHANGED: apps/web/src/app/timeline/page.tsx; components/timeline-view.tsx;
features/timeline/builder.ts, data.ts; test/timeline.test.ts; dashboard/page.tsx;
components/review-workspace.tsx; workers/e2e.ts; docs/checkpoints.md.
COMMANDS RUN: npm run test:worker:e2e -- --timeline; database.py verify; npm test;
npm run lint; npm run typecheck; npm run build; pytest; Ruff; browser bundle secret
scan; git diff --check.
TEST RESULTS: 49 web tests PASS; 15 processor tests PASS; lint, typecheck, production
build, Ruff, secret scan, and diff check PASS. Live isolated flow produced 1 document,
10 reviewed facts, and 11 timeline events with verified source links. Extracted and
rejected facts were absent from the trusted timeline.
DATE BEHAVIOR: child clinical date, then medical-record/document event date, then
document creation time. Creation-time fallbacks display the explicit label Upload date.
FILTERS: All, Labs, Medications, Diagnoses, Allergies, Vitals, Procedures, Documents,
plus case-insensitive title/description search.
ISSUES FOUND: none. No Phase 9 migration was required. Python dependencies continue to
emit seven upstream deprecation warnings.
CLEANUP: restored 2 users, 2 storage objects, 2 queued documents, 2 queued jobs, and
zero page/block/medical/child rows. Existing records were unchanged.
REMAINING LIMITATIONS: date range filtering is not included; documents without medical
dates use labelled upload dates; dynamic events are computed at request time rather than
persisted; no event editing exists in this phase.
NEXT PHASE: stop. Do not begin Phase 10 without explicit instruction.

## Phase 10 — Medical records search
STATUS: PASS
IMPLEMENTED: authenticated server-rendered `/search`; dashboard shortcut; bounded
query validation; grouped document, source-text, and reviewed-fact results; category
filters; result counts; safe empty/no-result states; confidence/review badges; source
document and exact provenance links.
ARCHITECTURE: direct PostgreSQL `ilike` queries through the user's Supabase session.
Results are capped per source, deduplicated, and capped at 60 overall. Structured child
queries run in parallel and medical-record/document metadata is fetched in batches.
No vector service, LLM, persisted search event, service role, or Phase 10 migration.
SEARCHABLE ENTITIES: document display/original name, type; OCR/native blocks; reviewed
labs, medications, diagnoses, allergies, vitals, procedures, and doctor notes.
TRUST: only approved/corrected facts are returned; extracted and rejected facts are
excluded from normal search. Source text remains clearly labelled as source text.
FILTERS: All, Documents, Text blocks, Labs, Medications, Diagnoses, Allergies, Vitals,
Procedures, Doctor notes.
FILES CHANGED: apps/web/src/app/search/page.tsx; features/search/model.ts, data.ts;
test/search.test.ts; dashboard/page.tsx; workers/e2e.ts; docs/checkpoints.md.
COMMANDS RUN: npm run test:worker:e2e -- --search; database.py verify; npm test;
npm run lint; npm run typecheck; npm run build; pytest; Ruff; browser bundle secret
scan; git diff --check.
TEST RESULTS: 53 web tests PASS; 15 processor tests PASS; lint, typecheck, production
build, Ruff, secret scan, and diff check PASS. Live isolated flow verified searches for
document name, OCR phrase, lab test, medication, and diagnosis plus provenance link.
CLEANUP: restored 2 users, 2 storage objects, 2 queued documents, 2 queued jobs, and
zero page/block/medical/child rows. Existing records were unchanged.
SECURITY: authenticated server data loader, explicit owner filters plus RLS, strict
80-character query validation, no raw text logging, no server secrets in client output.
REMAINING LIMITATIONS: literal substring matching only; no ranking, stemming, typo
tolerance, date filters, pagination UI, or semantic search. Overall results are capped.
NEXT PHASE: stop. Do not begin Phase 11 without explicit instruction.
