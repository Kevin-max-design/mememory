# MedMemory

Patient-owned medical records with local processing and source provenance.
**Current status: authentication and secure private uploads are working against the
development project. The stateless local document processor supports native PDF text
and page-level Tesseract OCR fallback. Worker persistence is not connected.**
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
Ollama is optional; leave its variables unset if unused.

PaddleOCR and OpenMed are optional local providers. Keep `ENABLE_PADDLEOCR=false`
and `ENABLE_OPENMED=false` for the dependency-free fallback path. PaddleOCR is lazy
loaded and falls back to Tesseract if its import or local model initialization fails.
OpenMed 2.3 is used only through verified deterministic clinical utilities; MedMemory
retains candidate validation, provenance, and review. Do not install the multimodal
extra. Downloaded PaddleOCR/model assets must stay outside git.

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

Use a development project only. The foundation schema, generated types, RLS verification,
and private storage policies are deployed to the configured development project. The
optional profile-bootstrap improvement remains pending and must not be applied without
explicit approval while Supabase labels the default branch as production.

## Authentication

The web app includes email/password signup, login, confirmation callback, logout,
session refresh, protected dashboard routing, and server-side identity verification.
Supabase's hosted email confirmation flow requires its confirmation email template
to target `/auth/confirm` and the deployed/local site URL to be allowlisted. Remote
acceptance testing remains blocked while the dashboard labels the development
project's default branch as `main PRODUCTION`.

## Tesseract and Ollama

Tesseract powers local OCR for images and PDF pages without usable native text.
Ollama will remain optional with deterministic evidence fallback. No paid cloud AI
credentials are required.
