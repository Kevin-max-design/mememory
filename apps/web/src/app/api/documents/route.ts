import { NextResponse } from "next/server";
import { requestCorrelationId } from "@/features/audit/model";
import { recordAuditEvent } from "@/features/audit/server";
import { persistValidatedUpload } from "@/features/documents/persistence";
import {
  MAX_UPLOAD_REQUEST_BYTES,
  readBoundedRequestBody,
  validateUpload,
} from "@/features/documents/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logServerEvent } from "@/features/observability/logger";

export const runtime = "nodejs";

function jsonError(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const started = performance.now();
  const requestId = requestCorrelationId(request);
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_UPLOAD_REQUEST_BYTES
  ) {
    return jsonError("file_too_large", 413);
  }

  const sessionClient = await createClient();
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) return jsonError("unauthenticated", 401);
  const auditFailure = (errorCode: string, mimeType?: string) => { logServerEvent({ event: "upload.failed", requestId, route: "/api/documents", durationMs: Math.round(performance.now()-started), errorCode, environment: process.env.NODE_ENV }); return recordAuditEvent({ actorUserId: auth.user.id, action: "document.upload_failed", resourceType: "document", status: "failed", metadata: { error_code: errorCode, source_route: "/api/documents", ...(mimeType ? { mime_type: mimeType } : {}) }, requestId }); };

  const requestBody = await readBoundedRequestBody(request);
  if (!requestBody) { await auditFailure("UPLOAD_VALIDATION_FAILED"); return jsonError("file_too_large", 413); }

  let formData: FormData;
  try {
    formData = await new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: requestBody,
    }).formData();
  } catch {
    await auditFailure("UPLOAD_VALIDATION_FAILED");
    return jsonError("invalid_request", 400);
  }

  const upload = formData.get("file");
  if (!(upload instanceof File)) { await auditFailure("UPLOAD_VALIDATION_FAILED"); return jsonError("invalid_request", 400); }

  const bytes = new Uint8Array(await upload.arrayBuffer());
  const validation = validateUpload(upload.name, upload.type, bytes);
  if (!validation.ok) { await auditFailure("UPLOAD_VALIDATION_FAILED", upload.type); return jsonError(validation.code, 400); }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    await auditFailure("SERVER_CONFIGURATION", validation.file.mimeType);
    return jsonError("server_configuration", 503);
  }

  const result = await persistValidatedUpload(admin, {
    userId: auth.user.id,
    originalFilename: validation.originalFilename,
    bytes,
    file: validation.file,
  });
  if (!result.ok) {
    await auditFailure(result.code.toUpperCase(), validation.file.mimeType);
    const status = result.code === "upload_failed" ? 502 : 500;
    return jsonError(result.code, status);
  }

  await recordAuditEvent({ actorUserId: auth.user.id, action: "document.upload_completed", resourceType: "document", resourceId: result.documentId, status: "succeeded", metadata: { mime_type: validation.file.mimeType, source_route: "/api/documents" }, requestId }, admin);
  logServerEvent({ event: "upload.completed", requestId, route: "/api/documents", httpStatus: 201, durationMs: Math.round(performance.now()-started), documentId: result.documentId, environment: process.env.NODE_ENV });

  return NextResponse.json(
    { document: { id: result.documentId, status: result.status } },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
