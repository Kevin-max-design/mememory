# Security design and verification status

This is a development foundation, not a released patient-facing application.

## Implemented boundaries

- Server-only environment access; safe configuration errors show names, never values.
- Internal processor health endpoint requires a shared secret of at least 32 characters.
- Originals, tokens, and medical text are not logged by foundation code.
- Database migration enables RLS on all 18 patient tables, denies anonymous table
  access, and explicitly grants owner-scoped reads to authenticated users.
- Basic profile edits use both USING and WITH CHECK ownership predicates.
- Composite foreign keys prohibit linking child rows to another patient's parent.
- Private medical-records bucket has a 20 MiB limit and an explicit MIME allowlist.
- Storage reads require the authenticated owner and an actual document path match.
  Client upload, overwrite, and deletion permissions are not granted.

These database protections are deployed to medmemory-dev. Runtime tests verified RLS,
ownership boundaries, anonymous denial, and private-bucket configuration.

## Credential handling

.env.database.local stores the development database password and is Git-ignored.
The migration runner reads it locally and supplies it directly to the database driver;
it does not interpolate credentials into shell commands. A hardcoded development
project reference prevents accidentally applying this setup to an unrelated project.
Database connections require TLS. Setup files must never be committed.

## Planned verification

scripts/database_security.py runs as real authenticated/anonymous PostgreSQL roles.
It creates synthetic users and document evidence, checks RLS, owner reads, cross-user
read/update/delete/insert failures, anonymous denial, and composite foreign keys.
All fixture changes are rolled back. This is not a substitute for later Auth API,
Storage API, or browser E2E tests.

## Outstanding security work

Authentication/session flows, secure upload orchestration, job locking and transactions,
OCR resource bounds, sharing/passcodes/rate limits, emergency publication, deletion,
audit redaction, and full release security review remain unimplemented.
