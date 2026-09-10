import { createHash, randomUUID } from "node:crypto";
import type { SupportedFile } from "./validation";

type MutationResult = { error: unknown | null };
type FilterBuilder = PromiseLike<MutationResult> & {
  eq(column: string, value: string): FilterBuilder;
};
type PersistenceClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        bytes: Uint8Array,
        options: { cacheControl: string; contentType: string; upsert: boolean },
      ): Promise<MutationResult>;
      remove(paths: string[]): Promise<MutationResult>;
    };
  };
  from(table: string): {
    insert(values: Record<string, unknown>): Promise<MutationResult>;
    delete(): FilterBuilder;
    update(values: Record<string, unknown>): FilterBuilder;
  };
};

export type PersistenceResult =
  | { ok: true; documentId: string; status: "queued" }
  | {
      ok: false;
      code:
        | "upload_failed"
        | "persistence_failed"
        | "cleanup_failed";
    };

export async function persistValidatedUpload(
  adminClient: unknown,
  input: {
    userId: string;
    originalFilename: string;
    bytes: Uint8Array;
    file: SupportedFile;
  },
): Promise<PersistenceResult> {
  const admin = adminClient as PersistenceClient;
  const documentId = randomUUID();
  const generatedFilename = `${randomUUID()}.${input.file.extension}`;
  const storagePath = `${input.userId}/${documentId}/original/${generatedFilename}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  const { error: storageError } = await admin.storage
    .from("medical-records")
    .upload(storagePath, input.bytes, {
      cacheControl: "private, max-age=0",
      contentType: input.file.mimeType,
      upsert: false,
    });
  if (storageError) return { ok: false, code: "upload_failed" };

  let documentCreated = false;
  const cleanup = async () => {
    const outcomes: MutationResult[] = [];
    if (documentCreated) {
      outcomes.push(
        await admin.from("documents").delete().eq("id", documentId),
      );
    }
    outcomes.push(
      await admin.storage.from("medical-records").remove([storagePath]),
    );
    return outcomes.every((outcome) => !outcome.error);
  };

  const { error: documentError } = await admin.from("documents").insert({
    id: documentId,
    user_id: input.userId,
    original_filename: input.originalFilename,
    display_name: input.originalFilename,
    mime_type: input.file.mimeType,
    file_size: input.bytes.length,
    sha256,
    storage_path: storagePath,
    processing_status: "uploaded",
  });
  if (documentError) {
    return {
      ok: false,
      code: (await cleanup()) ? "persistence_failed" : "cleanup_failed",
    };
  }
  documentCreated = true;

  const { error: jobError } = await admin.from("processing_jobs").insert({
    user_id: input.userId,
    document_id: documentId,
    job_type: "analyze",
    status: "queued",
  });
  if (jobError) {
    return {
      ok: false,
      code: (await cleanup()) ? "persistence_failed" : "cleanup_failed",
    };
  }

  const { error: stateError } = await admin
    .from("documents")
    .update({ processing_status: "queued" })
    .eq("id", documentId)
    .eq("user_id", input.userId);
  if (stateError) {
    return {
      ok: false,
      code: (await cleanup()) ? "persistence_failed" : "cleanup_failed",
    };
  }

  return { ok: true, documentId, status: "queued" };
}
