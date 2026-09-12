export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

export async function readBoundedRequestBody(request: Request, maximumBytes = MAX_UPLOAD_REQUEST_BYTES) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export const documentStates = [
  "uploaded",
  "queued",
  "processing",
  "needs_review",
  "completed",
  "failed",
] as const;

export type DocumentState = (typeof documentStates)[number];

export const documentStateTransitions: Record<DocumentState, DocumentState[]> = {
  uploaded: ["queued", "failed"],
  queued: ["processing", "failed"],
  processing: ["needs_review", "completed", "failed"],
  needs_review: ["completed", "failed"],
  completed: [],
  failed: ["queued"],
};

export type SupportedFile = {
  extension: "pdf" | "jpg" | "png" | "webp";
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
};

const extensionsByMime = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
} as const;

function endsWith(bytes: Uint8Array, suffix: number[]) {
  if (bytes.length < suffix.length) return false;
  const offset = bytes.length - suffix.length;
  return suffix.every((value, index) => bytes[offset + index] === value);
}

function detectContent(bytes: Uint8Array): SupportedFile | undefined {
  const starts = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);

  if (
    bytes.length >= 8 &&
    starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) &&
    endsWith(bytes, [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  ) {
    return { extension: "png", mimeType: "image/png" };
  }

  if (
    bytes.length >= 4 &&
    starts(0xff, 0xd8, 0xff) &&
    endsWith(bytes, [0xff, 0xd9])
  ) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  if (
    bytes.length >= 12 &&
    starts(0x52, 0x49, 0x46, 0x46) &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const declaredLength =
      bytes[4] |
      (bytes[5] << 8) |
      (bytes[6] << 16) |
      (bytes[7] << 24);
    if (declaredLength + 8 === bytes.length) {
      return { extension: "webp", mimeType: "image/webp" };
    }
  }

  if (bytes.length >= 9 && starts(0x25, 0x50, 0x44, 0x46, 0x2d)) {
    const tail = new TextDecoder("latin1").decode(bytes.slice(-1024));
    if (tail.includes("%%EOF")) {
      return { extension: "pdf", mimeType: "application/pdf" };
    }
  }
}

export type UploadValidationResult =
  | { ok: true; file: SupportedFile; originalFilename: string }
  | {
      ok: false;
      code:
        | "empty_file"
        | "file_too_large"
        | "invalid_filename"
        | "unsupported_file"
        | "file_type_mismatch";
    };

export function validateUpload(
  name: string,
  declaredMime: string,
  bytes: Uint8Array,
): UploadValidationResult {
  if (bytes.length === 0) return { ok: false, code: "empty_file" };
  if (bytes.length > MAX_UPLOAD_BYTES)
    return { ok: false, code: "file_too_large" };

  const trimmedName = name.trim();
  if (
    !trimmedName ||
    trimmedName.length > 255 ||
    trimmedName.includes("/") ||
    trimmedName.includes("\\") ||
    trimmedName.includes("\0")
  ) {
    return { ok: false, code: "invalid_filename" };
  }

  const detected = detectContent(bytes);
  if (!detected) return { ok: false, code: "unsupported_file" };

  const declaredExtensions =
    extensionsByMime[declaredMime as keyof typeof extensionsByMime];
  const suppliedExtension = trimmedName.split(".").pop()?.toLowerCase();
  if (
    declaredMime !== detected.mimeType ||
    !declaredExtensions ||
    !suppliedExtension ||
    !(declaredExtensions as readonly string[]).includes(suppliedExtension)
  ) {
    return { ok: false, code: "file_type_mismatch" };
  }

  return { ok: true, file: detected, originalFilename: trimmedName };
}

export const uploadErrorMessages: Record<string, string> = {
  empty_file: "Choose a file that is not empty.",
  file_too_large: "The file is larger than the 20 MB limit.",
  invalid_filename: "The filename is invalid.",
  unsupported_file: "Use a PDF, JPEG, PNG, or WEBP file.",
  file_type_mismatch: "The filename, file type, and file contents do not match.",
  unauthenticated: "Your session has expired. Sign in and try again.",
  upload_failed: "The file could not be stored. Please try again.",
  persistence_failed: "The upload could not be saved. No file was retained.",
  cleanup_failed:
    "The upload failed and automatic cleanup needs attention. Please contact support.",
  invalid_request: "Choose a file to upload.",
  server_configuration: "Secure upload is not configured on this server.",
};
