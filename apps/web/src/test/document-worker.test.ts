import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CompletionUncertainError,
  DocumentWorker,
  MAX_BLOCKS_PER_PAGE,
  processorResponseSchema,
  WorkerFailure,
  type ClaimedDocumentJob,
  type WorkerDependencies,
} from "@/workers/document-worker";
import { readBoundedJsonResponse, SupabaseWorkerDependencies } from "@/workers/documents";

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
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("document worker orchestration", () => {
  it("rejects processor responses that exceed the byte budget", async () => {
    const response = new Response(JSON.stringify({ value: "oversized" }));
    await expect(readBoundedJsonResponse(response, 4)).rejects.toMatchObject({
      code: "PROCESSOR_RESPONSE_TOO_LARGE",
    });
  });

  it("rejects excessive OCR blocks before persistence", () => {
    const blocks = Array.from({ length: MAX_BLOCKS_PER_PAGE + 1 }, (_, index) => ({
      ...processorResponse.data.pages[0].blocks[0],
      id: `block-${index}`,
    }));
    const response = {
      ...processorResponse,
      data: {
        ...processorResponse.data,
        pages: [{ ...processorResponse.data.pages[0], blocks }],
      },
    };
    expect(processorResponseSchema.safeParse(response).success).toBe(false);
  });
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
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "processing.completed", status: "succeeded" }));
  });

  it("prefers a validated source-bound OpenMed candidate over a deterministic duplicate", async () => {
    const text = "Creatinine 1.1 mg/dl 0.6-1.3";
    const response = {
      ...processorResponse,
      data: {
        ...processorResponse.data,
        pages: [{ ...processorResponse.data.pages[0], full_text: text,
          blocks: [{ ...processorResponse.data.pages[0].blocks[0], text, region: "main_content" }] }],
        clinical_brain: { name: "openmed", version: "2.3.0", invoked: true, model_backed: false,
          apis_used: ["split_measurement_text"], warnings: [], candidates_before_validation: 1,
          candidates_after_validation: 1, rejected_reasons: {} },
        clinical_candidates: [{ record_type: "lab", source_page_number: 1,
          source_block_ids: ["p1-native-0"], source_text: text, confidence: "high",
          data: { test_name: "Creatinine", original_value: "1.1", numeric_value: 1.1,
            unit: "mg/dl", reference_range: "0.6-1.3", flag: null, specimen: null, collected_at: null } }],
      },
    };
    const deps = dependencies({ analyze: vi.fn().mockResolvedValue(response) });
    await new DocumentWorker(deps).runOnce();
    const payload = vi.mocked(deps.complete).mock.calls[0][1];
    expect(payload.candidates).toHaveLength(1);
    expect(payload.candidates[0].extractionMethod).toBe("openmed");
  });

  it("rejects an OpenMed candidate without source binding and keeps deterministic fallback", async () => {
    const text = "Creatinine 1.1 mg/dl";
    const response = { ...processorResponse, data: { ...processorResponse.data,
      pages: [{ ...processorResponse.data.pages[0], full_text: text,
        blocks: [{ ...processorResponse.data.pages[0].blocks[0], text, region: "main_content" }] }],
      clinical_candidates: [{ record_type: "lab", source_page_number: 1,
        source_block_ids: ["missing"], source_text: text, confidence: "high",
        data: { test_name: "Creatinine", original_value: "1.1", numeric_value: 1.1, unit: "mg/dl" } }],
    } };
    const deps = dependencies({ analyze: vi.fn().mockResolvedValue(response) });
    await new DocumentWorker(deps).runOnce();
    const payload = vi.mocked(deps.complete).mock.calls[0][1];
    expect(payload.candidates).toHaveLength(1);
    expect(payload.candidates[0].extractionMethod).toBe("deterministic");
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
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "processing.failed", status: "failed", metadata: expect.objectContaining({ error_code: "PROCESSOR_UNAVAILABLE" }) }));
  });

  it("does not retry a processor wall-clock timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    const dependencies = new SupabaseWorkerDependencies({} as never, {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(32),
      DOCUMENT_PROCESSOR_URL: "https://processor.internal",
      DOCUMENT_PROCESSOR_SECRET: "s".repeat(32),
    } as never);
    try {
      await expect(dependencies.analyze(job, content)).rejects.toMatchObject({ code: "PROCESSOR_TIMEOUT", retryable: false });
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("does not change processing success when audit recording fails", async () => {
    const deps = dependencies({ audit: vi.fn().mockRejectedValue(new Error("audit unavailable")) });
    await expect(new DocumentWorker(deps).runOnce()).resolves.toMatchObject({ outcome: "completed" });
  });
});
