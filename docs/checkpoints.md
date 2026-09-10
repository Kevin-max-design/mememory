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
