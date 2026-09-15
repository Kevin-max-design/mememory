import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DocumentWorker, WorkerFailure, type ClaimedDocumentJob, type WorkerDependencies } from "@/workers/document-worker";

const bytes = new TextEncoder().encode("synthetic recovery fixture");
const job: ClaimedDocumentJob = {
  jobId: "10000000-0000-4000-8000-000000000001",
  documentId: "20000000-0000-4000-8000-000000000002",
  userId: "30000000-0000-4000-8000-000000000003",
  lockToken: "40000000-0000-4000-8000-000000000004",
  attemptCount: 3,
  maxAttempts: 3,
  storagePath: "30000000-0000-4000-8000-000000000003/20000000-0000-4000-8000-000000000002/original/50000000-0000-4000-8000-000000000005.pdf",
  mimeType: "application/pdf",
  fileSize: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};

function dependencies(overrides: Partial<WorkerDependencies>): WorkerDependencies {
  return {
    claim: vi.fn().mockResolvedValue(job), renew: vi.fn().mockResolvedValue(true),
    download: vi.fn().mockResolvedValue(bytes), analyze: vi.fn(), complete: vi.fn(),
    fail: vi.fn().mockResolvedValue("failed"), audit: vi.fn().mockResolvedValue(undefined), ...overrides,
  };
}

describe("failure recovery", () => {
  it("turns a processor timeout into a bounded safe retry outcome", async () => {
    const failure = new WorkerFailure("PROCESSOR_TIMEOUT", true, "The document processor timed out.");
    const deps = dependencies({ analyze: vi.fn().mockRejectedValue(failure), fail: vi.fn().mockResolvedValue("failed") });
    await expect(new DocumentWorker(deps).runOnce()).resolves.toEqual({ outcome: "failed", jobId: job.jobId, code: "PROCESSOR_TIMEOUT" });
    expect(deps.fail).toHaveBeenCalledWith(job, failure);
  });

  it("rejects malformed processor output without completing a job", async () => {
    const deps = dependencies({ analyze: vi.fn().mockResolvedValue({ ok: true, data: { pages: "invalid" } }) });
    await expect(new DocumentWorker(deps).runOnce()).resolves.toEqual({ outcome: "failed", jobId: job.jobId, code: "PROCESSOR_INVALID_RESPONSE" });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("keeps stale-lock, exhaustion, and duplicate-job database guards", () => {
    const foundation = readFileSync(resolve(process.cwd(), "../../supabase/migrations/202609090001_foundation.sql"), "utf8");
    const worker = readFileSync(resolve(process.cwd(), "../../supabase/migrations/202609100002_document_worker.sql"), "utf8");
    expect(foundation).toContain("create unique index one_active_job");
    expect(worker).toContain("candidate.attempt_count < candidate.max_attempts");
    expect(worker).toContain("candidate.locked_at < now() - make_interval");
    expect(worker).toContain("status = 'failed'");
  });

  it("documents no guaranteed RPO/RTO and contains no credential values", () => {
    const runbook = readFileSync(resolve(process.cwd(), "../../docs/recovery.md"), "utf8");
    expect(runbook).toContain("UNKNOWN / NOT YET GUARANTEED");
    expect(runbook).toContain("Database recovery restores only rows in `storage.objects`");
    expect(runbook).not.toMatch(/postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i);
    expect(runbook).not.toMatch(/(?:service_role|RATE_LIMIT_HASH_SECRET)\s*=\s*\S+/);
  });

  it("keeps representative database failures behind stable non-PHI codes", () => {
    const search = readFileSync(resolve(process.cwd(), "src/features/search/data.ts"), "utf8");
    const ask = readFileSync(resolve(process.cwd(), "src/features/ask/data.ts"), "utf8");
    const audit = readFileSync(resolve(process.cwd(), "src/features/audit/server.ts"), "utf8");
    expect(search).toContain("SEARCH_QUERY_FAILED");
    expect(search).toContain("SEARCH_CONTEXT_FAILED");
    expect(ask).toContain("ASK_EVIDENCE_READ_FAILED");
    expect(audit).toContain("AUDIT_WRITE_FAILED");
    expect([search, ask, audit].join("\n")).not.toMatch(/console\.(?:log|error)\([^)]*(query|question|source_text)/i);
  });
});
