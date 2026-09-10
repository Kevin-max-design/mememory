# Data model

Status: migration applied to the medmemory-dev Supabase project and verified with
rollback-only cross-user tests. TypeScript database types were generated from the
deployed schema.

All patient resources use UUIDs. Every owned relation has a direct user ID or the
profile ID. Composite foreign keys tie pages, blocks, facts, subtype rows, events,
and shared document selections to the same owner as their parents.

## Records and evidence

Original documents retain their filename, content hash, MIME, size, generated private
storage path, processing state, and extraction provider versions. Pages and blocks
retain OCR geometry and source type. Each medical record requires source text, page,
block IDs, extraction method/version, confidence, and a deterministic fingerprint.
A trigger checks block ownership, document, and page. A document/fingerprint unique
constraint prevents duplicate facts. Candidate, approved, corrected, and rejected
statuses remain distinct. Normalized storage paths point to derivatives.

Subtype tables store diagnoses, medications, labs, allergies, procedures, vitals,
and doctor notes. Missing clinical values remain nullable. Lab and vital values
retain original text alongside optional numeric representations. Medical events
store dates with an explicit estimated-date marker.

## Public access metadata

Share and emergency tokens are represented only by SHA-256 hashes. Share selections
have ownership foreign keys for both the share and document. Anonymous users have
no direct table grants. Public access workflows must be implemented on the server
before either feature becomes usable. Emergency profiles start disabled, with no
fields selected for exposure.

## System data

Processing jobs enforce bounded attempts and at most one active job per document.
Audit logs retain rows when an account is removed, setting the user reference null.
Applications must keep medical text, credentials, and tokens out of audit metadata.

## Write permissions

Authenticated clients can read only their own rows and update their own basic
profile. Derived records, processing jobs, audit logs, shares, and storage objects
require validated server workflows. The service role remains server-only and must
explicitly verify the authenticated owner before writes. RLS remains enabled on
all patient tables even where client writes are denied by grants.
