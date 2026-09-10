import { createHash } from "node:crypto";
import { z } from "zod";

const boundingBoxSchema = z
  .object({
    x0: z.number().finite().nonnegative(),
    y0: z.number().finite().nonnegative(),
    x1: z.number().finite().nonnegative(),
    y1: z.number().finite().nonnegative(),
  })
  .refine((box) => box.x1 >= box.x0 && box.y1 >= box.y0);

export const processorResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z.object({
      document_id: z.uuid(),
      mime_type: z.enum([
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ]),
      page_count: z.number().int().min(1).max(250),
      pages: z.array(
        z.object({
          page_number: z.number().int().positive(),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
          rotation: z.number().int(),
          skew_angle: z.number().finite().min(-12).max(12),
          source: z.enum(["native_pdf", "ocr"]),
          full_text: z.string(),
          blocks: z.array(
            z.object({
              id: z.string().min(1).max(100),
              text: z.string().min(1).max(1_000_000),
              confidence: z.number().min(0).max(1).nullable(),
              bbox: boundingBoxSchema,
            }),
          ),
          provider: z.object({
            name: z.string().min(1).max(100),
            version: z.string().min(1).max(100),
            preprocessing: z.array(z.string().max(100)).max(20),
          }),
        }),
      ),
    }),
  })
  .refine((response) => response.data.page_count === response.data.pages.length, {
    message: "Page count does not match pages",
  })
  .refine(
    (response) =>
      new Set(response.data.pages.map((page) => page.page_number)).size ===
      response.data.pages.length,
    { message: "Page numbers must be unique" },
  );

export type ProcessorResponse = z.infer<typeof processorResponseSchema>;

export type ClaimedDocumentJob = {
  jobId: string;
  documentId: string;
  userId: string;
  lockToken: string;
  attemptCount: number;
  maxAttempts: number;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
};

export type PersistedPage = {
  page_number: number;
  width: number;
  height: number;
  rotation: number;
  skew_angle: number;
  native_text_used: boolean;
  blocks: {
    block_index: number;
    text: string;
    confidence: number | null;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    source_type: "native_pdf" | "ocr";
  }[];
};

export type CompletionPayload = {
  pages: PersistedPage[];
  ocrProvider: string | null;
  ocrVersion: string | null;
};

export class WorkerFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly safeMessage: string,
  ) {
    super(code);
  }
}

export class ClaimLostError extends Error {}
export class CompletionUncertainError extends Error {}

export type WorkerDependencies = {
  claim(): Promise<ClaimedDocumentJob | null>;
  renew(job: ClaimedDocumentJob): Promise<boolean>;
  download(job: ClaimedDocumentJob): Promise<Uint8Array>;
  analyze(job: ClaimedDocumentJob, content: Uint8Array): Promise<unknown>;
  complete(job: ClaimedDocumentJob, payload: CompletionPayload): Promise<void>;
  fail(
    job: ClaimedDocumentJob,
    failure: WorkerFailure,
  ): Promise<"queued" | "failed">;
};

export type WorkerResult =
  | { outcome: "idle" }
  | { outcome: "completed"; jobId: string; documentId: string }
  | { outcome: "requeued" | "failed"; jobId: string; code: string }
  | {
      outcome: "claim_lost" | "completion_uncertain" | "failure_report_failed";
      jobId: string;
    };

function completionPayload(response: ProcessorResponse): CompletionPayload {
  const pages = response.data.pages.map((page) => ({
    page_number: page.page_number,
    width: page.width,
    height: page.height,
    rotation: page.rotation,
    skew_angle: page.skew_angle,
    native_text_used: page.source === "native_pdf",
    blocks: page.blocks.map((block, blockIndex) => ({
      block_index: blockIndex,
      text: block.text,
      confidence: block.confidence,
      bbox: block.bbox,
      source_type: page.source,
    })),
  }));
  const ocrPage = response.data.pages.find((page) => page.source === "ocr");
  return {
    pages,
    ocrProvider: ocrPage?.provider.name ?? null,
    ocrVersion: ocrPage?.provider.version ?? null,
  };
}

function normalizeFailure(error: unknown) {
  if (error instanceof WorkerFailure) return error;
  return new WorkerFailure(
    "PROCESSING_JOB_FAILED",
    true,
    "Document processing failed unexpectedly.",
  );
}

export class DocumentWorker {
  constructor(
    private readonly dependencies: WorkerDependencies,
    private readonly heartbeatMilliseconds = 30_000,
  ) {}

  async runOnce(): Promise<WorkerResult> {
    const job = await this.dependencies.claim();
    if (!job) return { outcome: "idle" };

    let claimLost = false;
    const heartbeat = setInterval(() => {
      void this.dependencies
        .renew(job)
        .then((renewed) => {
          if (!renewed) claimLost = true;
        })
        .catch(() => {
          // A transient renewal error does not prove ownership was lost.
        });
    }, this.heartbeatMilliseconds);
    heartbeat.unref();

    try {
      const content = await this.dependencies.download(job);
      if (content.byteLength !== job.fileSize) {
        throw new WorkerFailure(
          "STORAGE_SIZE_MISMATCH",
          false,
          "Stored document size does not match its metadata.",
        );
      }
      const actualHash = createHash("sha256").update(content).digest("hex");
      if (actualHash !== job.sha256) {
        throw new WorkerFailure(
          "STORAGE_INTEGRITY_MISMATCH",
          false,
          "Stored document integrity verification failed.",
        );
      }

      const rawResponse = await this.dependencies.analyze(job, content);
      const parsed = processorResponseSchema.safeParse(rawResponse);
      if (!parsed.success) {
        throw new WorkerFailure(
          "PROCESSOR_INVALID_RESPONSE",
          false,
          "The document processor returned an invalid response.",
        );
      }
      if (
        parsed.data.data.document_id !== job.documentId ||
        parsed.data.data.mime_type !== job.mimeType
      ) {
        throw new WorkerFailure(
          "PROCESSOR_RESPONSE_MISMATCH",
          false,
          "The document processor response did not match the claimed document.",
        );
      }
      if (!parsed.data.data.pages.some((page) => page.blocks.length > 0)) {
        throw new WorkerFailure(
          "OCR_NO_TEXT_FOUND",
          false,
          "No readable text was found in the document.",
        );
      }
      if (claimLost) throw new ClaimLostError();

      await this.dependencies.complete(job, completionPayload(parsed.data));
      return { outcome: "completed", jobId: job.jobId, documentId: job.documentId };
    } catch (error) {
      if (error instanceof CompletionUncertainError) {
        return { outcome: "completion_uncertain", jobId: job.jobId };
      }
      if (error instanceof ClaimLostError) {
        return { outcome: "claim_lost", jobId: job.jobId };
      }

      const failure = normalizeFailure(error);
      try {
        const nextStatus = await this.dependencies.fail(job, failure);
        return {
          outcome: nextStatus === "queued" ? "requeued" : "failed",
          jobId: job.jobId,
          code: failure.code,
        };
      } catch {
        return { outcome: "failure_report_failed", jobId: job.jobId };
      }
    } finally {
      clearInterval(heartbeat);
    }
  }
}
