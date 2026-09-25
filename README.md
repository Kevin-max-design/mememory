# MedMemory

Patient-owned medical records with local processing and source provenance.
**Current status: the authenticated web beta supports private upload, local document
processing, human review, timeline, search, evidence-bound Ask, privacy export, and
deletion. The database-backed worker persists page/block provenance and structured
candidates. Qwen/VLM experiments are research-only and are not part of v0.1.**
See docs/product-brief.txt for the complete target specification and docs/architecture.md
for the discovery results and architecture.

## Prerequisites

Node >=22, npm, Python 3.10.16, and Tesseract for the local OCR pipeline.
A separate **development** Supabase project is required for database integration.

## Environment

Copy .env.example to apps/web/.env.local and fill in your development Supabase URL,
anon key, and service-role key. Generate a random processor secret of at least 32
characters. Never commit credentials. Put the same DOCUMENT_PROCESSOR_SECRET in
services/document-processor/.env. Both services reject missing required configuration.
The v0.1 Ask path has a deterministic evidence fallback and does not require a cloud AI
provider. Leave optional Ollama variables unset unless its adapter is being developed.

PaddleOCR and OpenMed are optional local providers. Keep `ENABLE_PADDLEOCR=false`
and `ENABLE_OPENMED=false` for the dependency-free fallback path. PaddleOCR is lazy
loaded and falls back to Tesseract if its import or local model initialization fails.
OpenMed 2.3 is used only through verified deterministic clinical utilities; MedMemory
retains candidate validation, provenance, and review. Do not install the multimodal
extra. Downloaded PaddleOCR/model assets must stay outside git.

### Local OCR benchmark

The benchmark reads one local PDF, writes nothing to Supabase or disk, and prints only
page-level diagnostics without document text:

```sh
npm run benchmark:ocr -- /absolute/path/to/report.pdf
npm run benchmark:clinical -- /absolute/path/to/report.pdf
npm run benchmark:clinical:synthetic
```

PaddleOCR model downloads are intentionally manual. When models are absent, the command
stops before inference and prints the exact initialization command. After the models are
downloaded, set `ENABLE_PADDLEOCR=true` in the processor's ignored local `.env` file.
`ENABLE_OCR_DEBUG=true` enables identifiers and aggregate page diagnostics; it never logs
OCR text. The processor labels likely page-edge/disclaimer noise for extraction and
reconstructs PaddleOCR table cells by vertical geometry.
The clinical command also invokes OpenMed's verified deterministic measurement APIs and
reports OpenMed, deterministic, validation, deduplication, and composite candidate counts.
It does not enable model-backed clinical NER or print candidate values or source text.
The synthetic command exercises the cached `urchade/gliner_large_bio-v0.1` model through
OpenMed with diagnosis, medication, allergy, procedure, finding, and assertion fixtures.
It is local-only and reports aggregate counts without printing entity or fixture text.

## Install

```sh
npm ci
python3 -m venv services/document-processor/.venv
services/document-processor/.venv/bin/python -m pip install -e 'services/document-processor[dev]'
```

## Run web

```sh
npm run dev
```

## Run processor

```sh
cd services/document-processor
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

GET /health and POST /v1/documents/analyze require the x-service-secret header. The
analysis endpoint accepts a UUID, declared MIME type, base64 file payload, and bounded
options. It returns page text, blocks, confidence and bounding boxes without database
access. Health indicates service startup, not OCR readiness.

## Run document worker

Start the processor first, then run the database-backed worker from the repository root:

```sh
npm run worker:documents
```

Use `npm run worker:documents -- --once` to claim at most one job. The worker verifies
the stored file size and SHA-256 before processing, renews its claim during long OCR,
and atomically persists pages, blocks, and deterministic medical-record candidates through
service-role-only database functions. Candidates retain page/block provenance, stable
fingerprints, confidence, and `extracted` review status. The worker never logs document
content or credentials, and user-reviewed records block automatic replacement.

## Test and build

```sh
npm run lint
npm run typecheck
npm test
npm run build
cd services/document-processor
.venv/bin/ruff check .
.venv/bin/pytest
```

## Supabase setup

Use a development/staging project for verification. Migrations through
`202609140003_privacy_rate_limit.sql`, including profile bootstrap, are deployed to the
configured staging project. `202609240001_account_deletion_guard.sql` is a new local
release-hardening migration and must not be applied remotely without explicit approval.

## Authentication

The web app includes full-name/email/password signup, login, logout, session refresh,
protected routes, and server-side identity verification. For the v0.1 immediate-session
flow, the hosted Email provider must be enabled and Confirm email must be disabled.
Password recovery infrastructure remains compatible; `/auth/confirm` is retained for
future confirmation/recovery callbacks.

## Tesseract and Ollama

Tesseract powers local OCR for images and PDF pages without usable native text.
Ollama will remain optional with deterministic evidence fallback. No paid cloud AI
credentials are required.
