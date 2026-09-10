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
