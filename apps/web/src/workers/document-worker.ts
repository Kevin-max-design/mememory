import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DeterministicExtractionProvider,
  ExtractionError,
  type ExtractionCandidate,
  type ExtractionProvider,
} from "../features/extraction";

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
              region: z.enum(["main_content", "likely_header", "likely_footer", "disclaimer"]).optional(),
            }),
          ),
          provider: z.object({
            name: z.string().min(1).max(100),
            version: z.string().min(1).max(100),
            preprocessing: z.array(z.string().max(100)).max(20),
            selected_variant: z.string().max(100).nullable().optional(),
            quality_score: z.number().min(0).max(1).nullable().optional(),
            quality_label: z.enum(["high", "medium", "low"]).nullable().optional(),
            quality_reason: z.string().max(300).nullable().optional(),
            fallback_reason: z.string().max(100).nullable().optional(),
          }),
        }),
      ),
      clinical_provider: z.object({
        name: z.string().max(100),
        version: z.string().max(100),
        preprocessing: z.array(z.string().max(100)).max(20),
      }).passthrough().optional(),
      clinical_brain: z.object({
        name: z.string().max(100),
        version: z.string().max(100),
        invoked: z.boolean(),
        model_backed: z.boolean(),
        model_name: z.string().max(200).nullable().optional(),
        apis_used: z.array(z.string().max(100)),
        warnings: z.array(z.string().max(200)),
        candidates_before_validation: z.number().int().nonnegative(),
        candidates_after_validation: z.number().int().nonnegative(),
        rejected_reasons: z.record(z.string(), z.number().int().nonnegative()),
        raw_proposals_by_category: z.record(z.string(), z.number().int().nonnegative()).optional(),
        accepted_by_category: z.record(z.string(), z.number().int().nonnegative()).optional(),
        section_headings_detected: z.record(z.string(), z.number().int().nonnegative()).optional(),
        proposals_with_section_context: z.number().int().nonnegative().optional(),
        ner_blocks_evaluated: z.number().int().nonnegative().optional(),
      }).optional(),
      clinical_candidates: z.array(z.object({
        record_type: z.enum(["lab", "medication", "diagnosis", "allergy", "vital", "procedure", "doctor_note"]),
        source_page_number: z.number().int().positive(),
        source_block_ids: z.array(z.string().min(1)).min(1),
        source_text: z.string().min(1),
        confidence: z.enum(["high", "medium", "low"]),
        data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
        source_start: z.number().int().nonnegative().nullable().optional(),
        source_end: z.number().int().nonnegative().nullable().optional(),
        entity_text: z.string().nullable().optional(),
        normalized_name: z.string().nullable().optional(),
        assertion: z.record(z.string(), z.string()).optional(),
        provider: z.string().max(100).optional(),
        provider_version: z.string().max(100).optional(),
        model_name: z.string().max(200).nullable().optional(),
        model_confidence: z.number().min(0).max(1).nullable().optional(),
      })).optional(),
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
    id: string;
    block_index: number;
    text: string;
    confidence: number | null;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    source_type: "native_pdf" | "ocr";
  }[];
};

export type CompletionPayload = {
  pages: PersistedPage[];
  candidates: ExtractionCandidate[];
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

function semanticKey(candidate: ExtractionCandidate) {
  const identity = candidate.recordType === "lab"
    ? [candidate.data.test_name, candidate.data.original_value, candidate.data.unit]
    : Object.values(candidate.data).filter((value) => value !== null).slice(0, 3);
  return JSON.stringify([candidate.recordType, candidate.sourcePageNumber, identity]).toLowerCase();
}

function openMedCandidates(response: ProcessorResponse, pages: PersistedPage[]) {
  const sources = new Map<string, { id: string; page: number; text: string; region?: string }>();
  response.data.pages.forEach((page, pageIndex) => page.blocks.forEach((block, blockIndex) => {
    sources.set(block.id, { id: pages[pageIndex].blocks[blockIndex].id, page: page.page_number, text: block.text, region: block.region });
  }));
  const rejected: Record<string, number> = {};
  const accepted: ExtractionCandidate[] = [];
  for (const proposal of response.data.clinical_candidates ?? []) {
    const bound = proposal.source_block_ids.map((id) => sources.get(id));
    let reason: string | null = null;
    if (bound.some((source) => !source)) reason = "no_provenance";
    else if (bound.some((source) => source?.page !== proposal.source_page_number)) reason = "no_provenance";
    else if (bound.some((source) => source?.region && source.region !== "main_content")) reason = "likely_header_footer";
    else if (!bound.some((source) => source?.text.includes(proposal.source_text))) reason = "no_provenance";
    else if (proposal.source_start != null && proposal.source_end != null &&
      proposal.entity_text !== proposal.source_text.slice(proposal.source_start, proposal.source_end)) reason = "invalid_span";
    else if (!/[A-Za-z]{2}/.test(proposal.source_text) || /^[\W_]+$/.test(proposal.source_text)) reason = "garbage_punctuation";
    else if (proposal.record_type === "lab" && (!proposal.data.test_name || !proposal.data.original_value)) reason = "no_same_row_value";
    if (reason) { rejected[reason] = (rejected[reason] ?? 0) + 1; continue; }
    const sourceIds = bound.map((source) => source!.id);
    const fingerprint = createHash("sha256").update(JSON.stringify([
      response.data.document_id, proposal.record_type, proposal.source_page_number,
      proposal.data, proposal.source_text.trim().replace(/\s+/g, " ").toLowerCase(),
    ])).digest("hex");
    accepted.push({ recordType: proposal.record_type, eventDate: null, confidence: proposal.confidence,
      sourceDocumentId: response.data.document_id, sourcePageNumber: proposal.source_page_number,
      sourceBlockIds: sourceIds, sourceText: proposal.source_text, extractionMethod: "openmed",
      extractionVersion: proposal.provider_version ?? response.data.clinical_brain?.version ?? "2.3.0", fingerprint, data: proposal.data });
  }
  return { accepted, rejected };
}

function completionPayload(
  response: ProcessorResponse,
  extractionProvider: ExtractionProvider,
): CompletionPayload {
  const pages = response.data.pages.map((page) => ({
    page_number: page.page_number,
    width: page.width,
    height: page.height,
    rotation: page.rotation,
    skew_angle: page.skew_angle,
    native_text_used: page.source === "native_pdf",
    blocks: page.blocks.map((block, blockIndex) => ({
      id: randomUUID(),
      block_index: blockIndex,
      text: block.text,
      confidence: block.confidence,
      bbox: block.bbox,
      source_type: page.source,
    })),
  }));
  const deterministic = extractionProvider.extract(
    response.data.document_id,
    response.data.pages.flatMap((page, pageIndex) =>
      page.blocks.map((block, blockIndex) => ({
        id: pages[pageIndex].blocks[blockIndex].id,
        pageNumber: page.page_number,
        text: block.text,
        region: block.region,
      })),
    ),
  );
  const openmed = openMedCandidates(response, pages);
  const merged = new Map<string, ExtractionCandidate>();
  for (const candidate of [...openmed.accepted, ...deterministic]) {
    const key = semanticKey(candidate);
    if (!merged.has(key)) merged.set(key, candidate);
  }
  const candidates = [...merged.values()];
  if (process.env.ENABLE_OCR_DEBUG === "true") {
    for (const page of response.data.pages) {
      console.info("ocr_extraction_diagnostic", {
        documentId: response.data.document_id,
        pageNumber: page.page_number,
        provider: page.provider.name,
        fallback: page.provider.fallback_reason ?? "none",
        variant: page.provider.selected_variant ?? "default",
        quality: page.provider.quality_score ?? null,
        blockCount: page.blocks.length,
        candidateCount: candidates.filter((candidate) => candidate.sourcePageNumber === page.page_number).length,
        lowConfidenceReason: page.provider.quality_reason ?? null,
      });
    }
    console.info("clinical_brain_diagnostic", {
      documentId: response.data.document_id,
      openMedInvoked: response.data.clinical_brain?.invoked ?? false,
      openMedBeforeValidation: response.data.clinical_candidates?.length ?? 0,
      openMedAfterValidation: openmed.accepted.length,
      deterministicCandidates: deterministic.length,
      compositeCandidates: candidates.length,
      duplicatesRemoved: openmed.accepted.length + deterministic.length - candidates.length,
      rejectedReasons: openmed.rejected,
    });
  }
  const ocrPage = response.data.pages.find((page) => page.source === "ocr");
  return {
    pages,
    candidates,
    ocrProvider: ocrPage?.provider.name ?? null,
    ocrVersion: ocrPage?.provider.version ?? null,
  };
}

function normalizeFailure(error: unknown) {
  if (error instanceof WorkerFailure) return error;
  if (error instanceof ExtractionError) {
    return new WorkerFailure(error.code, false, error.safeMessage);
  }
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
    private readonly extractionProvider: ExtractionProvider =
      new DeterministicExtractionProvider(),
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

      let payload: CompletionPayload;
      try {
        payload = completionPayload(parsed.data, this.extractionProvider);
      } catch (error) {
        if (error instanceof ExtractionError) throw error;
        throw new WorkerFailure(
          "EXTRACTION_INVALID_OUTPUT",
          false,
          "Structured extraction produced invalid output.",
        );
      }
      await this.dependencies.complete(job, payload);
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
