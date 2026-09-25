# MedMemory architecture

Status: v0.1 release-candidate hardening. Implemented patient workflows cover
authentication, private upload, local processing, human review, records, timeline,
search, evidence-bound Ask, privacy export, and deletion.

The npm workspace contains a Next.js App Router web application. Supabase owns Auth,
PostgreSQL, and private object storage. A separately supervised TypeScript worker claims
database jobs and owns privileged persistence. The stateless FastAPI processor receives
bounded internal payloads and never fetches user-supplied URLs or connects to Supabase.

Original documents are immutable. Native/OCR text, extraction candidates, and
user-reviewed facts are separate trust levels. Every candidate retains document, page,
and block provenance. Processing completion is transactional and idempotent; user
corrections survive reprocessing.

Local OCR/OpenMed plus deterministic validation is the v0.1 production path. Human
review is mandatory before facts become trusted. Qwen/VLM work under
`experiments/clinical-vlm` is research-only and is not packaged as a production service.

## Runtime flow

1. The web server verifies the Supabase session, validates the upload, and reserves a
   generated owner/document row before writing to the private bucket.
2. A service-role-only job is queued. The worker claims it with a lock token, downloads
   the expected object, and verifies size and SHA-256.
3. The worker sends the bounded document to the authenticated internal processor.
   Native PDF text is preferred; scanned pages use local OCR within document-wide work
   budgets. OpenMed/deterministic extraction produces source-bound candidates.
4. The worker validates the response and atomically persists pages, blocks, and
   candidates. Users review candidates before trusted views consume them.

## Security boundaries

- Browser: publishable Supabase configuration only; no service-role or processor secret.
- Web server: verified sessions, bounded input, rate limits, safe audit/log envelopes,
  and explicit owner propagation for service-role operations.
- Database: RLS, composite ownership keys, server-controlled state transitions,
  append-only audit privileges, and atomic persistent limiter functions.
- Storage: private bucket, generated paths, no overwrite, owner-scoped reads, and
  compensating cleanup.
- Worker: service-role authority, lock-token-bound jobs, integrity verification, bounded
  processor responses, and no medical text logs.
- Processor: shared-secret authentication, local parsing/OCR, no database authority, and
  file/page/pixel/OCR/output limits.

## Release gates

Required gates are web lint, strict typecheck, unit tests, production build,
browser-secret scan, processor Ruff/pytest, migration parity, cross-user RLS tests,
backup/restore evidence, synthetic Storage recovery, and one isolated staging E2E flow.
Production deployment also requires trusted-edge header rewriting, TLS or loopback for
the processor, and worker/processor resource isolation.
