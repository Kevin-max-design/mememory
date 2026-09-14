import { NextResponse } from "next/server";
import { z } from "zod";
import { requestCorrelationId } from "@/features/audit/model";
import { recordAuditEvent } from "@/features/audit/server";
import { reviewUpdateSchema } from "@/features/medical-records/review-schema";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = requestCorrelationId(request);
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Authentication is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "The review request is invalid." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  const parsed = reviewUpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "The review fields are invalid." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "The document identifier is invalid." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const { data, error } = await supabase.rpc("review_medical_record", {
    p_document_id: id,
    p_record_id: parsed.data.recordId,
    p_action: parsed.data.action,
    p_correction: parsed.data.action === "correct" ? parsed.data.correction as unknown as Json : null,
  });
  if (error) {
    await recordAuditEvent({ actorUserId: auth.user.id, action: "review.failed", resourceType: "medical_record", resourceId: parsed.data.recordId, status: "failed", metadata: { error_code: "REVIEW_UPDATE_FAILED", review_action: parsed.data.action, source_route: "/api/records/review" }, requestId });
    const notFound = error.message.includes("RECORD_NOT_FOUND");
    return NextResponse.json({ error: notFound ? "Record not found." : "The review change could not be saved." }, { status: notFound ? 404 : 400, headers: { "Cache-Control": "no-store" } });
  }
  const action = parsed.data.action === "approve" ? "review.approved" : parsed.data.action === "correct" ? "review.corrected" : "review.rejected";
  await recordAuditEvent({ actorUserId: auth.user.id, action, resourceType: "medical_record", resourceId: parsed.data.recordId, status: "succeeded", metadata: { review_action: parsed.data.action, source_route: "/api/records/review" }, requestId });
  return NextResponse.json({ ok: true, documentStatus: data }, { headers: { "Cache-Control": "no-store" } });
}
