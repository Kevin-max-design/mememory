import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CompletionUncertainError,
  DocumentWorker,
  WorkerFailure,
  type ClaimedDocumentJob,
  type WorkerDependencies,
} from "@/workers/document-worker";

const content = new TextEncoder().encode("synthetic document bytes");
const job: ClaimedDocumentJob = {
  jobId: "10000000-0000-4000-8000-000000000001",
  documentId: "20000000-0000-4000-8000-000000000002",
  userId: "30000000-0000-4000-8000-000000000003",
  lockToken: "40000000-0000-4000-8000-000000000004",
  attemptCount: 1,
  maxAttempts: 3,
  storagePath:
    "30000000-0000-4000-8000-000000000003/20000000-0000-4000-8000-000000000002/original/50000000-0000-4000-8000-000000000005.pdf",
  mimeType: "application/pdf",
  fileSize: content.byteLength,
  sha256: createHash("sha256").update(content).digest("hex"),
};

const processorResponse = {
  ok: true,
  data: {
    document_id: job.documentId,
    mime_type: job.mimeType,
    page_count: 1,
    pages: [
      {
        page_number: 1,
        width: 612,
        height: 792,
        rotation: 0,
        skew_angle: 0,
        source: "native_pdf",
        full_text: "Synthetic source text only.",
        blocks: [
          {
            id: "p1-native-0",
            text: "Synthetic source text only.",
            confidence: null,
            bbox: { x0: 10, y0: 20, x1: 200, y1: 40 },
          },
        ],
        provider: { name: "pymupdf", version: "1.28", preprocessing: [] },
      },
    ],
  },
};

function dependencies(
  overrides: Partial<WorkerDependencies> = {},
): WorkerDependencies {
  return {
    claim: vi.fn().mockResolvedValue(job),
    renew: vi.fn().mockResolvedValue(true),
    download: vi.fn().mockResolvedValue(content),
    analyze: vi.fn().mockResolvedValue(processorResponse),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue("failed"),
    ...overrides,
  };
}

describe("document worker orchestration", () => {
  it("returns idle when no job is available", async () => {
    const worker = new DocumentWorker(
      dependencies({ claim: vi.fn().mockResolvedValue(null) }),
    );
    await expect(worker.runOnce()).resolves.toEqual({ outcome: "idle" });
  });

  it("downloads, verifies, analyzes, and persists blocks", async () => {
    const deps = dependencies();
    const worker = new DocumentWorker(deps);

    await expect(worker.runOnce()).resolves.toEqual({
      outcome: "completed",
      jobId: job.jobId,
      documentId: job.documentId,
    });
    expect(deps.download).toHaveBeenCalledWith(job);
    expect(deps.analyze).toHaveBeenCalledWith(job, content);
    expect(deps.complete).toHaveBeenCalledWith(
      job,
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            page_number: 1,
            native_text_used: true,
            blocks: [
              expect.objectContaining({
                block_index: 0,
                source_type: "native_pdf",
              }),
            ],
          }),
        ],
      }),
    );
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("requeues retryable provider failures", async () => {
    const failure = new WorkerFailure(
      "PROCESSOR_UNAVAILABLE",
      true,
      "The processor is unavailable.",
    );
    const deps = dependencies({
      analyze: vi.fn().mockRejectedValue(failure),
      fail: vi.fn().mockResolvedValue("queued"),
    });

    await expect(new DocumentWorker(deps).runOnce()).resolves.toEqual({
      outcome: "requeued",
      jobId: job.jobId,
      code: "PROCESSOR_UNAVAILABLE",
    });
    expect(deps.fail).toHaveBeenCalledWith(job, failure);
  });

  it("fails non-retryable integrity mismatches before processing", async () => {
    const deps = dependencies({
      download: vi.fn().mockResolvedValue(new TextEncoder().encode("wrong content bytes")),
    });
    const result = await new DocumentWorker(deps).runOnce();

    expect(result).toEqual({
      outcome: "failed",
      jobId: job.jobId,
      code: "STORAGE_SIZE_MISMATCH",
    });
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ retryable: false }),
    );
  });

  it("rejects responses for a different document", async () => {
    const deps = dependencies({
      analyze: vi.fn().mockResolvedValue({
        ...processorResponse,
        data: {
          ...processorResponse.data,
          document_id: "60000000-0000-4000-8000-000000000006",
        },
      }),
    });
    const result = await new DocumentWorker(deps).runOnce();
    expect(result).toEqual({
      outcome: "failed",
      jobId: job.jobId,
      code: "PROCESSOR_RESPONSE_MISMATCH",
    });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("does not overwrite a possibly committed completion", async () => {
    const deps = dependencies({
      complete: vi.fn().mockRejectedValue(new CompletionUncertainError()),
    });
    await expect(new DocumentWorker(deps).runOnce()).resolves.toEqual({
      outcome: "completion_uncertain",
      jobId: job.jobId,
    });
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("reports failure-update errors without leaking upstream details", async () => {
    const deps = dependencies({
      analyze: vi.fn().mockRejectedValue(new Error("sensitive upstream response")),
      fail: vi.fn().mockRejectedValue(new Error("database details")),
    });
    await expect(new DocumentWorker(deps).runOnce()).resolves.toEqual({
      outcome: "failure_report_failed",
      jobId: job.jobId,
    });
  });
});
