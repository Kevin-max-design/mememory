import { NextResponse } from "next/server";
import { persistValidatedUpload } from "@/features/documents/persistence";
import {
  MAX_UPLOAD_BYTES,
  validateUpload,
} from "@/features/documents/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(code: string, status: number) {
  return NextResponse.json({ code }, { status });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_UPLOAD_BYTES + 1024 * 1024
  ) {
    return jsonError("file_too_large", 413);
  }

  const sessionClient = await createClient();
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) return jsonError("unauthenticated", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("invalid_request", 400);
  }

  const upload = formData.get("file");
  if (!(upload instanceof File)) return jsonError("invalid_request", 400);

  const bytes = new Uint8Array(await upload.arrayBuffer());
  const validation = validateUpload(upload.name, upload.type, bytes);
  if (!validation.ok) return jsonError(validation.code, 400);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("server_configuration", 503);
  }

  const result = await persistValidatedUpload(admin, {
    userId: auth.user.id,
    originalFilename: validation.originalFilename,
    bytes,
    file: validation.file,
  });
  if (!result.ok) {
    const status = result.code === "upload_failed" ? 502 : 500;
    return jsonError(result.code, status);
  }

  return NextResponse.json(
    { document: { id: result.documentId, status: result.status } },
    { status: 201 },
  );
}
