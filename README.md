# MedMemory

Patient-owned medical records with local processing and source provenance.
**Current status: secure foundation deployed; authentication is implemented locally
but remote acceptance verification is blocked pending confirmation of the Supabase
target classification. Document upload is not implemented.**
See docs/product-brief.txt for the complete target specification and docs/architecture.md
for the discovery results and architecture.

## Prerequisites

Node >=22, npm, Python >=3.11, and Tesseract for the future OCR pipeline.
A separate **development** Supabase project is required for database integration.

## Environment

Copy .env.example to apps/web/.env.local and fill in your development Supabase URL,
anon key, and service-role key. Generate a random processor secret of at least 32
characters. Never commit credentials. Put the same DOCUMENT_PROCESSOR_SECRET in
services/document-processor/.env. Both services reject missing required configuration.
Ollama is optional; leave its variables unset if unused.

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

GET /health requires the x-service-secret header. Health indicates service startup,
not OCR readiness. The document analysis endpoint and worker are not implemented yet.

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

Use a development project only. Database migrations, generated types, RLS verification,
and storage policies are pending. No schema has been applied. Do not upload real patient
data to this foundation. A locally configured CLI login/project link or development
PostgreSQL connection is required before migration execution.

## Authentication

The web app includes email/password signup, login, confirmation callback, logout,
session refresh, protected dashboard routing, and server-side identity verification.
Supabase's hosted email confirmation flow requires its confirmation email template
to target `/auth/confirm` and the deployed/local site URL to be allowlisted. Remote
acceptance testing remains blocked while the dashboard labels the development
project's default branch as `main PRODUCTION`.

## Tesseract and Ollama

Tesseract is available on the initial development host; OCR integration is pending.
Ollama will remain optional with deterministic evidence fallback. No paid cloud AI
credentials are required.
