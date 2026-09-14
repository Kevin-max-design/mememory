import { NextResponse } from "next/server";
import { z } from "zod";
import { requestCorrelationId } from "@/features/audit/model";
import { recordAuditEvent } from "@/features/audit/server";
import { logServerEvent } from "@/features/observability/logger";
import { deleteOwnedDocument } from "@/features/privacy/deletion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = requestCorrelationId(request);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ code: "invalid_document_id" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (request.headers.get("x-medmemory-confirm") !== "delete-document") return NextResponse.json({ code: "confirmation_required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const session = await createClient();
  const { data: auth, error } = await session.auth.getUser();
  if (error || !auth.user) return NextResponse.json({ code: "unauthenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const result = await deleteOwnedDocument(createAdminClient(), auth.user.id, id);
  if (!result.ok) {
    logServerEvent({ event: "document.delete_failed", requestId, route: "/api/privacy/documents/[id]", errorCode: result.code, documentId: id, environment: process.env.NODE_ENV });
    return NextResponse.json({ code: "document_delete_failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (!result.alreadyDeleted) await recordAuditEvent({ actorUserId: auth.user.id, action: "document.deleted", resourceType: "document", resourceId: id, status: "succeeded", metadata: { source_route: "/api/privacy/documents/delete" }, requestId });
  logServerEvent({ event: "document.deleted", requestId, route: "/api/privacy/documents/[id]", httpStatus: 204, documentId: id, environment: process.env.NODE_ENV });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
