import { Buffer } from "node:buffer";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { safeAuditMetadata } from "@/features/audit/model";
import type { Database, Json } from "@/types/database.types";
import {
  CompletionUncertainError,
  DocumentWorker,
  WorkerFailure,
  type ClaimedDocumentJob,
  type CompletionPayload,
  type WorkerDependencies,
  type WorkerResult,
} from "./document-worker";

export const workerEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DOCUMENT_PROCESSOR_URL: z.url(),
  DOCUMENT_PROCESSOR_SECRET: z.string().min(32),
});

export const MAX_PROCESSOR_RESPONSE_BYTES = 64 * 1024 * 1024;

export async function readBoundedJsonResponse(
  response: Response,
  maximumBytes = MAX_PROCESSOR_RESPONSE_BYTES,
): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    throw new WorkerFailure("PROCESSOR_RESPONSE_TOO_LARGE", false, "The document processor returned too much data.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new WorkerFailure("PROCESSOR_INVALID_RESPONSE", false, "The document processor returned an invalid response.");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new WorkerFailure("PROCESSOR_RESPONSE_TOO_LARGE", false, "The document processor returned too much data.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new WorkerFailure("PROCESSOR_INVALID_RESPONSE", false, "The document processor returned an invalid response.");
  }
}

const claimSchema = z.object({
  job_id: z.uuid(),
  document_id: z.uuid(),
  user_id: z.uuid(),
  lock_token: z.uuid(),
  attempt_count: z.number().int().positive(),
  max_attempts: z.number().int().positive(),
  storage_path: z.string().min(1),
  mime_type: z.string().min(1),
  file_size: z.number().int().positive().max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export class SupabaseWorkerDependencies implements WorkerDependencies {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly environment: WorkerEnvironment,
    private readonly targetJobId: string | null = null,
  ) {}

  async claim(): Promise<ClaimedDocumentJob | null> {
    const { data, error } = await this.supabase.rpc("claim_document_processing_job", {
      p_job_id: this.targetJobId,
      p_lock_timeout_seconds: 900,
    });
    if (error) {
      throw new WorkerFailure(
        "JOB_CLAIM_FAILED",
        true,
        "A processing job could not be claimed.",
      );
    }
    if (!data?.length) return null;
    const parsed = claimSchema.safeParse(data[0]);
    if (!parsed.success) {
      throw new WorkerFailure(
        "JOB_CLAIM_INVALID",
        false,
        "The claimed job was invalid.",
      );
    }
    const claim = parsed.data;
    const expectedPrefix = `${claim.user_id}/${claim.document_id}/original/`;
    if (!claim.storage_path.startsWith(expectedPrefix)) {
      throw new WorkerFailure(
        "STORAGE_PATH_INVALID",
        false,
        "The stored document path is invalid.",
      );
    }
    return {
      jobId: claim.job_id,
      documentId: claim.document_id,
      userId: claim.user_id,
      lockToken: claim.lock_token,
      attemptCount: claim.attempt_count,
      maxAttempts: claim.max_attempts,
      storagePath: claim.storage_path,
      mimeType: claim.mime_type,
      fileSize: claim.file_size,
      sha256: claim.sha256,
    };
  }

  async renew(job: ClaimedDocumentJob) {
    const { data, error } = await this.supabase.rpc("renew_document_processing_job", {
      p_job_id: job.jobId,
      p_lock_token: job.lockToken,
    });
    return !error && data === true;
  }

  async download(job: ClaimedDocumentJob) {
    const { data, error } = await this.supabase.storage
      .from("medical-records")
      .download(job.storagePath);
    if (error || !data) {
      throw new WorkerFailure(
        "STORAGE_DOWNLOAD_FAILED",
        true,
        "The stored document could not be retrieved.",
      );
    }
    return new Uint8Array(await data.arrayBuffer());
  }

  async analyze(job: ClaimedDocumentJob, content: Uint8Array) {
    let response: Response;
    try {
      response = await fetch(
        new URL("/v1/documents/analyze", this.environment.DOCUMENT_PROCESSOR_URL),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-service-secret": this.environment.DOCUMENT_PROCESSOR_SECRET,
          },
          body: JSON.stringify({
            document_id: job.documentId,
            mime_type: job.mimeType,
            content_base64: Buffer.from(content).toString("base64"),
          }),
          signal: AbortSignal.timeout(15 * 60 * 1000),
        },
      );
    } catch {
      throw new WorkerFailure(
        "PROCESSOR_UNAVAILABLE",
        true,
        "The document processor is unavailable.",
      );
    }

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      let providerCode = "PROCESSOR_REQUEST_FAILED";
      try {
        const body = (await readBoundedJsonResponse(response, 64 * 1024)) as { error?: { code?: unknown } };
        if (
          typeof body.error?.code === "string" &&
          /^[A-Z0-9_]{3,100}$/.test(body.error.code)
        ) {
          providerCode = body.error.code;
        }
      } catch {
        // Upstream bodies are never logged or exposed.
      }
      throw new WorkerFailure(
        providerCode,
        retryable,
        retryable
          ? "The document processor is temporarily unavailable."
          : "The document processor rejected the document.",
      );
    }

    try {
      return await readBoundedJsonResponse(response);
    } catch (error) {
      if (error instanceof WorkerFailure) throw error;
      throw new WorkerFailure(
        "PROCESSOR_INVALID_RESPONSE",
        false,
        "The document processor returned an invalid response.",
      );
    }
  }

  async complete(job: ClaimedDocumentJob, payload: CompletionPayload) {
    const { data, error } = await this.supabase.rpc(
      "complete_document_processing_with_extraction",
      {
        p_job_id: job.jobId,
        p_lock_token: job.lockToken,
        p_pages: payload.pages as unknown as Json,
        p_candidates: payload.candidates.map((candidate) => ({
          record_type: candidate.recordType,
          event_date: candidate.eventDate,
          confidence: { high: 0.95, medium: 0.75, low: 0.5 }[
            candidate.confidence
          ],
          source_document_id: candidate.sourceDocumentId,
          source_page_number: candidate.sourcePageNumber,
          source_block_ids: candidate.sourceBlockIds,
          source_text: candidate.sourceText,
          extraction_method: candidate.extractionMethod,
          extraction_version: candidate.extractionVersion,
          fingerprint: candidate.fingerprint,
          data: candidate.data,
        })) as unknown as Json,
        p_ocr_provider: payload.ocrProvider,
        p_ocr_version: payload.ocrVersion,
      },
    );
    if (error) {
      const knownCode = [
        "EXTRACTION_INVALID_OUTPUT",
        "EXTRACTION_PROVENANCE_MISSING",
        "EXTRACTION_PROTECTED_RECORDS_EXIST",
      ].find((code) => error.message.includes(code));
      throw new WorkerFailure(
        knownCode === "EXTRACTION_PROVENANCE_MISSING"
          ? "EXTRACTION_PROVENANCE_MISSING"
          : knownCode === "EXTRACTION_INVALID_OUTPUT"
            ? "EXTRACTION_INVALID_OUTPUT"
            : "EXTRACTION_PERSISTENCE_FAILED",
        false,
        knownCode === "EXTRACTION_PROVENANCE_MISSING"
          ? "An extracted record is missing source provenance."
          : "Structured extraction could not be persisted safely.",
      );
    }
    if (data !== true) throw new CompletionUncertainError();
  }

  async fail(job: ClaimedDocumentJob, failure: WorkerFailure) {
    const { data, error } = await this.supabase.rpc("fail_document_processing_job", {
      p_job_id: job.jobId,
      p_lock_token: job.lockToken,
      p_error_code: failure.code,
      p_error_message: failure.safeMessage,
      p_retryable: failure.retryable,
    });
    if (error || (data !== "queued" && data !== "failed")) {
      throw new Error("JOB_FAILURE_UPDATE_FAILED");
    }
    return data;
  }

  async audit(event: Parameters<NonNullable<WorkerDependencies["audit"]>>[0]) {
    const { error } = await this.supabase.from("audit_logs").insert({ user_id: event.actorUserId, action: event.action, resource_type: "processing_job", resource_id: event.resourceId, metadata: safeAuditMetadata(event.status, event.metadata) });
    if (error) console.warn("audit_write_failed", { action: event.action });
  }
}

function safeLog(result: WorkerResult, durationMs: number) {
  process.stdout.write(`${JSON.stringify({ event: "document_worker.completed", ...result, durationMs })}\n`);
}

async function main() {
  config({
    path: fileURLToPath(new URL("../../.env.local", import.meta.url)),
    quiet: true,
  });
  const parsed = workerEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    process.stderr.write("Document worker configuration is incomplete.\n");
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes("--check-config")) {
    process.stdout.write("Document worker configuration is valid.\n");
    return;
  }

  const supabase = createClient<Database>(
    parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const targetArgument = process.argv.find((argument) =>
    argument.startsWith("--job-id="),
  );
  const targetJobId = targetArgument?.slice("--job-id=".length) ?? null;
  if (targetJobId && !z.uuid().safeParse(targetJobId).success) {
    process.stderr.write("The requested job ID is invalid.\n");
    process.exitCode = 1;
    return;
  }
  const worker = new DocumentWorker(
    new SupabaseWorkerDependencies(supabase, parsed.data, targetJobId),
  );
  const runOnce = process.argv.includes("--once");

  do {
    try {
      const startedAt = performance.now();
      const result = await worker.runOnce();
      safeLog(result, Math.round(performance.now() - startedAt));
      if (runOnce) {
        if (
          result.outcome === "failed" ||
          result.outcome === "claim_lost" ||
          result.outcome === "completion_uncertain" ||
          result.outcome === "failure_report_failed"
        ) {
          process.exitCode = 1;
        }
        return;
      }
      if (result.outcome === "idle") {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    } catch {
      process.stderr.write("Document worker could not claim a job.\n");
      if (runOnce) {
        process.exitCode = 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  } while (true);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
