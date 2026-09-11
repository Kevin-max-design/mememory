import { NextResponse } from "next/server";
import { reviewUpdateSchema } from "@/features/medical-records/review-schema";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "The review request is invalid." }, { status: 400 }); }
  const parsed = reviewUpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "The review fields are invalid." }, { status: 400 });
  const { id } = await context.params;
  const { data, error } = await supabase.rpc("review_medical_record", {
    p_document_id: id,
    p_record_id: parsed.data.recordId,
    p_action: parsed.data.action,
    p_correction: parsed.data.action === "correct" ? parsed.data.correction as unknown as Json : null,
  });
  if (error) {
    const notFound = error.message.includes("RECORD_NOT_FOUND");
    return NextResponse.json({ error: notFound ? "Record not found." : "The review change could not be saved." }, { status: notFound ? 404 : 400 });
  }
  return NextResponse.json({ ok: true, documentStatus: data });
}
