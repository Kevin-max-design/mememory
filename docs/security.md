# Security design and verification status

This describes the v0.1 release-candidate implementation. It is not a claim that the
application has completed production deployment verification.

## Implemented boundaries

- Server-only environment access; safe configuration errors show names, never values.
- Supabase sessions are verified server-side. Patient tables use owner RLS and composite
  ownership foreign keys; service-role workflows derive owners from verified sessions or
  database job claims.
- The private `medical-records` bucket enforces a 20 MiB limit and MIME allowlist.
  Originals use generated owner/document paths, cannot be overwritten by clients, and
  are checked by size and SHA-256 before processing.
- Upload persistence reserves an owner-bound document row before writing object bytes.
  Partial failures compensate both metadata and Storage.
- The worker uses service-role-only claim/renew/complete/fail functions with lock tokens,
  bounded retries, integrity checks, idempotent completion, and transactional page/block
  persistence.
- Trusted search, timeline, Ask, and export use approved/corrected records. Rejected
  records are excluded and extracted records remain visibly unreviewed.
- Persistent per-scope rate limits use HMAC identities and PostgreSQL atomic counters.
  Production fails closed when the limiter is unavailable.
- Audit metadata is allowlisted, PHI-free, and append-only to application roles.
- Processor requests require a shared secret. Non-loopback production processor URLs
  require TLS.
- Processor input has file, page, per-page pixel, aggregate rendered-pixel, OCR-page,
  output-block, output-text, response-size, and wall-clock controls.

These database protections are deployed to MedMemory staging through
`202609140003_privacy_rate_limit.sql`. Runtime tests have verified RLS, owner isolation,
anonymous denial, private Storage, worker persistence, review, rate limits, privacy
export, and append-only audit behavior using synthetic data.

## Credential handling

`.env.database.local` stores the staging database password and is Git-ignored. The
migration runner reads it locally and passes it directly to the database driver; it does
not interpolate credentials into shell commands. A hardcoded staging project reference
prevents accidentally applying this setup to another project. Database connections
require verified TLS. Environment and backup artifacts must never be committed.

## Verification

`scripts/database_security.py` runs as real authenticated/anonymous PostgreSQL roles.
It creates synthetic users and document evidence, checks RLS, owner reads, cross-user
read/update/delete/insert failures, anonymous denial, and composite foreign keys. Fixture
changes roll back. Separate staging drills verified hosted signup, private synthetic
Storage recovery, worker/extraction/review, rate-limit scopes, privacy export, audit
privileges, and database backup/restore without real patient data.

The standard repository security audit at checkpoint `10668d1` validated five findings.
The current release-hardening patch addresses session-cookie propagation, trusted proxy
selection, fail-closed limiter behavior, aggregate OCR work, and concurrent
upload/account-deletion serialization. Final closure still requires the gates below.

## Release prerequisites

- Apply and remotely verify `202609240001_account_deletion_guard.sql` before enabling
  account deletion in RC. It keeps the deletion marker server-controlled and serializes
  new document rows with erasure.
- Verify the deployment edge overwrites `RATE_LIMIT_TRUSTED_PROXY_HEADER`; never trust a
  header that can reach Node unchanged from the public client.
- Run the worker and processor under explicit CPU, memory, concurrency, filesystem, and
  network-egress limits.
- Add a tested Content Security Policy after final web and signed-preview origins are
  known.
- Produce a hashed Python dependency lock artifact for the immutable release image.
- Run one isolated synthetic staging RC flow and clean it up completely.
- Sharing and emergency publication remain outside v0.1 and must not be exposed.
