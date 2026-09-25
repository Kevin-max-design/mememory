# MedMemory v0.1 synthetic production smoke

Run this procedure once after all production services report healthy. Use a unique test
identifier and synthetic, non-sensitive document content. Do not use staging accounts,
patient records, medical files, or credentials.

## Baseline

Record counts only for Auth users, profiles, documents, processing jobs, pages, text
blocks, medical records and child tables, rate-limit buckets, audit events, and Storage
objects. A new production project should have zero user/application/Storage rows before
the smoke; migration and infrastructure rows are expected.

Confirm:

- the public origin serves the full security-header set over HTTPS;
- `/api/health` is healthy and `/api/ready` is ready;
- the private processor is unreachable from the public internet;
- the worker's configuration check succeeds;
- all three Render services report the approved commit SHA;
- web assets contain no service-role, processor, rate-limit, database, or deployment
  secret values.

## Synthetic flow

1. Create one public account with a unique `example.test` identity, synthetic full name,
   and a generated password. Verify immediate session, profile bootstrap, onboarding,
   and authenticated dashboard access.
2. Verify an anonymous request cannot access the dashboard, search, Ask, records,
   previews, export, or deletion routes.
3. Upload one small generated PDF containing an obvious synthetic banner and fictional
   lab, medication, diagnosis, and negated finding. Record only opaque row IDs and state
   transitions in the verification log; do not copy document text into logs.
4. Verify private Storage path authority, queued job creation, worker claim, processor
   completion, pages/blocks persistence, extraction candidates, and `needs_review` state.
5. Open source preview as the owner. Verify anonymous and cross-user access are denied.
6. Approve one candidate, correct one, and reject one. Verify only approved/corrected
   facts enter trusted timeline, search, Ask, and export results.
7. Verify timeline ordering, document-name and source-text search, reviewed-fact search,
   Ask citations, source page links, export attachment/no-store behavior, and rate-limit
   response headers using bounded requests.
8. Delete the document. Verify its rows, processing state, extracted/reviewed children,
   and Storage objects are removed without affecting audit history.
9. Log out and verify the session no longer opens authenticated routes.
10. Sign in again and delete the synthetic account. Verify new uploads are blocked once
    deletion starts and the workflow finishes without orphans.

## Cleanup and acceptance

Confirm Auth users, profiles, medical/application rows, and Storage objects return to the
pre-smoke baseline. Remove synthetic rate-limit buckets where the approved cleanup path
allows it; retain append-only audit events and document their count increase. Confirm no
synthetic content appears in logs, alerts, support tools, or build output.

The smoke passes only when every step succeeds, no cross-user access is possible, no
orphaned object or row remains, the deployed commit is exact, and monitoring shows no
unexpected 5xx, retry storm, memory exhaustion, or queue backlog. On any failure, keep
indexing and launch disabled, stop new workers if necessary, and follow the rollback
procedure in `docs/deployment.md`.
