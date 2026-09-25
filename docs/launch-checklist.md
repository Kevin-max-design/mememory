# MedMemory v0.1 beta launch checklist

The staging release candidate is certified at tag `v0.1-beta`. That tag is immutable.
Create a new release tag only after every applicable item below has evidence.

## Product and legal

- [x] Landing page describes the shipped, review-first workflow.
- [x] First-run onboarding directs a new user through upload, processing, and review.
- [x] Privacy, Terms, Support, and AI limitation pages exist.
- [x] Signup requires explicit Terms and Privacy acknowledgment.
- [ ] Counsel approves the operator identity, jurisdiction, governing law, privacy
      obligations, subprocessors, retention wording, and beta terms.
- [ ] `NEXT_PUBLIC_SUPPORT_EMAIL` is a monitored mailbox.
- [ ] Support ownership, response target, and incident escalation are assigned.

## Deployment

- [ ] Select the web, worker, and processor hosting targets and production region.
- [ ] Provision a production Supabase project; never repurpose staging.
- [ ] Restore-test a fresh production backup before schema application.
- [ ] Apply each reviewed production migration with explicit approval and verify it once.
- [ ] Configure the complete environment from `docs/deployment.md` in a secret store.
- [ ] Confirm the edge strips and regenerates the configured trusted proxy header.
- [ ] Build the processor from `uv.lock` on the target Linux architecture.
- [ ] Apply and measure CPU, memory, process, temporary-disk, timeout, and egress limits.
- [ ] Configure TLS, canonical domain, health checks, log access, retention, and alerts.
- [ ] Verify the CSP and every security header at the public origin.

## Production smoke and release

- [ ] Confirm `/api/health`, `/api/ready`, and processor `/health` from deployment probes.
- [ ] Run one synthetic fresh-user flow: signup, upload, processing, review/correct,
      timeline, search, Ask, export, document deletion, account deletion.
- [ ] Confirm the synthetic user, rows, Storage objects, rate buckets, and permitted test
      residue are cleaned up; do not use real medical data.
- [ ] Exercise application and processor rollback to the previous immutable artifact.
- [ ] Review error rate, queue latency, worker retries, processor memory, and alerts.
- [ ] Create and publish the launch tag from the verified commit.
- [ ] Set `NEXT_PUBLIC_ALLOW_INDEXING=true` only when public indexing is intended.

Qwen, VLM, and ADE experiments remain outside the release branch and launch artifact.
