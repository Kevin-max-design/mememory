# MedMemory architecture

Status: foundation in progress; no patient-data workflows are available yet.

The npm workspace contains apps/web (Next.js App Router, strict TypeScript, Tailwind).
services/document-processor is a stateless internal FastAPI service. Supabase owns
Auth, PostgreSQL, and private object storage. Next.js server-side orchestration will
retain database ownership. The processor receives bounded internal payloads rather
than fetching arbitrary user-supplied URLs.

Original documents are immutable. OCR text, extraction candidates, and user-reviewed
facts are separate trust levels. All facts must preserve document/page/block evidence.
Processing persistence and job completion must be atomic. User corrections survive
reprocessing. Local deterministic extraction is mandatory; Ollama is optional.

## Discovery

The initial workspace was empty. Git initially resolved to a home-directory repository;
an isolated repository was initialized here without changing the parent repository.
Node 22.23.2, npm 10.9.8, Python 3.14.5, and Tesseract are present. Docker and Supabase
CLI were not found. No credentials or existing schema were provided.

## Planned database

profiles; documents; document_pages; document_text_blocks; medical_records;
diagnoses; medications; lab_results; allergies; procedures; vitals; medical_events;
doctor_notes; emergency_profiles; share_links; share_link_documents;
processing_jobs; audit_logs. Patient tables require RLS and consistent composite
ownership foreign keys. Public token routes require explicit bounded access methods.

## Security boundaries

Browser: no service credentials, no authority derived from UI state.
Web server: authenticated operations, runtime validation, safe error envelopes.
Database: RLS, integrity constraints, transactional state transitions.
Storage: private bucket, generated paths scoped to authenticated owner.
Processor: shared-secret authentication, no request-body logs, local processing.
Public sharing: hashed random tokens, expiry/revocation, rate limits, explicit scope.

## Phase 1 gates

Web lint, strict typecheck, unit tests, production build; processor Ruff, pytest,
and authenticated health startup. Phase 2 cannot be marked passed without actual
migration application and cross-user database/storage security tests.
