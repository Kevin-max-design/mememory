import { describe, expect, it, vi } from "vitest";
import { persistValidatedUpload } from "@/features/documents/persistence";

function chain(error: unknown = null) {
  const result = {
    error,
    eq: vi.fn(),
    then: (
      resolve: (value: { error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ error }).then(resolve, reject),
  };
  result.eq.mockReturnValue(result);
  return result;
}

function mockAdmin(options: { jobError?: unknown; cleanupError?: unknown } = {}) {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: options.cleanupError ?? null });
  const deleteChain = chain(options.cleanupError);
  const updateChain = chain();
  const documentInsert = vi.fn().mockResolvedValue({ error: null });
  const jobInsert = vi.fn().mockResolvedValue({ error: options.jobError ?? null });
  const from = vi.fn((table: string) => ({
    insert: table === "documents" ? documentInsert : jobInsert,
    delete: vi.fn(() => deleteChain),
    update: vi.fn(() => updateChain),
  }));

  return {
    client: { storage: { from: vi.fn(() => ({ upload, remove })) }, from },
    upload,
    remove,
    deleteChain,
    documentInsert,
    jobInsert,
  };
}

const input = {
  userId: "00000000-0000-4000-8000-000000000001",
  originalFilename: "record.pdf",
  bytes: new TextEncoder().encode("%PDF-1.7\n%%EOF"),
  file: { extension: "pdf" as const, mimeType: "application/pdf" as const },
};

describe("upload persistence", () => {
  it("stores under generated authority and queues a processing job", async () => {
    const admin = mockAdmin();
    const result = await persistValidatedUpload(admin.client, input);

    expect(result.ok).toBe(true);
    expect(admin.upload).toHaveBeenCalledOnce();
    const storagePath = admin.upload.mock.calls[0][0] as string;
    expect(storagePath).toMatch(
      new RegExp(`^${input.userId}/[a-f0-9-]+/original/[a-f0-9-]+\\.pdf$`),
    );
    expect(storagePath).not.toContain(input.originalFilename);
    expect(admin.documentInsert).toHaveBeenCalledOnce();
    expect(admin.jobInsert).toHaveBeenCalledWith(
      expect.objectContaining({ job_type: "analyze", status: "queued" }),
    );
  });

  it("removes the object and document when job creation fails", async () => {
    const admin = mockAdmin({ jobError: new Error("simulated") });
    const result = await persistValidatedUpload(admin.client, input);

    expect(result).toEqual({ ok: false, code: "persistence_failed" });
    expect(admin.remove).toHaveBeenCalledOnce();
    expect(admin.deleteChain.eq).toHaveBeenCalledWith(
      "id",
      expect.any(String),
    );
  });

  it("reports when compensating cleanup fails", async () => {
    const admin = mockAdmin({
      jobError: new Error("simulated"),
      cleanupError: new Error("simulated cleanup"),
    });
    await expect(persistValidatedUpload(admin.client, input)).resolves.toEqual({
      ok: false,
      code: "cleanup_failed",
    });
  });
});
