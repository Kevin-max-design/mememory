import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  documentStateTransitions,
  readBoundedRequestBody,
  validateUpload,
} from "@/features/documents/validation";

const pdf = new TextEncoder().encode("%PDF-1.7\ncontent\n%%EOF");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

describe("secure upload validation", () => {
  it("stops reading a chunked request at the envelope limit", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(6));
          controller.enqueue(new Uint8Array(6));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readBoundedRequestBody(request, 10)).resolves.toBeNull();
  });

  it("preserves a request body within the envelope limit", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
    });
    await expect(readBoundedRequestBody(request, 3)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("passes an empty request through to normal multipart validation", async () => {
    const request = new Request("http://localhost/upload", { method: "POST" });
    await expect(readBoundedRequestBody(request, 3)).resolves.toEqual(new Uint8Array());
  });
  it.each([
    ["record.pdf", "application/pdf", pdf, "pdf"],
    ["scan.jpeg", "image/jpeg", jpeg, "jpg"],
    ["scan.png", "image/png", png, "png"],
    ["scan.webp", "image/webp", webp, "webp"],
  ])("accepts valid %s bytes", (name, mime, bytes, extension) => {
    const result = validateUpload(name, mime, bytes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.extension).toBe(extension);
  });

  it("rejects empty and oversized files", () => {
    expect(validateUpload("x.pdf", "application/pdf", new Uint8Array())).toEqual({
      ok: false,
      code: "empty_file",
    });
    expect(
      validateUpload(
        "x.pdf",
        "application/pdf",
        new Uint8Array(MAX_UPLOAD_BYTES + 1),
      ),
    ).toEqual({ ok: false, code: "file_too_large" });
  });

  it("rejects unsupported, malformed, and mismatched content", () => {
    expect(
      validateUpload("notes.txt", "text/plain", new TextEncoder().encode("hello")),
    ).toEqual({ ok: false, code: "unsupported_file" });
    expect(validateUpload("fake.pdf", "application/pdf", jpeg)).toEqual({
      ok: false,
      code: "file_type_mismatch",
    });
    expect(
      validateUpload("broken.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.7")),
    ).toEqual({ ok: false, code: "unsupported_file" });
  });

  it("rejects path-bearing filenames", () => {
    expect(validateUpload("../record.pdf", "application/pdf", pdf)).toEqual({
      ok: false,
      code: "invalid_filename",
    });
    expect(validateUpload("folder\\record.pdf", "application/pdf", pdf)).toEqual({
      ok: false,
      code: "invalid_filename",
    });
  });

  it("defines the queued processing state path", () => {
    expect(documentStateTransitions.uploaded).toContain("queued");
    expect(documentStateTransitions.queued).toContain("processing");
    expect(documentStateTransitions.completed).toEqual([]);
  });
});
