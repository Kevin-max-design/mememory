import "server-only";
import { requireUser } from "@/server/auth/require-user";
import { buildTimeline, type TimelineDocument, type TimelineRecord } from "./builder";

export async function getTimelineEvents() {
  const { supabase, user } = await requireUser();
  const [{ data: documentRows, error: documentError }, { data: recordRows, error: recordError }] = await Promise.all([
    supabase.from("documents").select("id,display_name,document_type,event_date,created_at,processing_status").eq("user_id", user.id),
    supabase.from("medical_records").select("id,document_id,record_type,review_status,event_date").eq("user_id", user.id).in("review_status", ["approved", "corrected"]),
  ]);
  if (documentError || recordError) throw new Error("TIMELINE_READ_FAILED");
  const ids = recordRows?.map((record) => record.id) ?? [];
  const children = new Map<string, Record<string, string | number | null>>();
  if (ids.length) {
    const results = await Promise.all([
      supabase.from("lab_results").select("*").in("medical_record_id", ids), supabase.from("medications").select("*").in("medical_record_id", ids),
      supabase.from("diagnoses").select("*").in("medical_record_id", ids), supabase.from("allergies").select("*").in("medical_record_id", ids),
      supabase.from("vitals").select("*").in("medical_record_id", ids), supabase.from("procedures").select("*").in("medical_record_id", ids),
      supabase.from("doctor_notes").select("*").in("medical_record_id", ids),
    ]);
    if (results.some((result) => result.error)) throw new Error("TIMELINE_CHILD_READ_FAILED");
    for (const result of results) for (const row of result.data ?? []) {
      const values = { ...(row as Record<string, string | number | null>) };
      const id = String(values.medical_record_id); delete values.id; delete values.medical_record_id; delete values.user_id; children.set(id, values);
    }
  }
  const documents: TimelineDocument[] = (documentRows ?? []).map((document) => ({ id: document.id, displayName: document.display_name, documentType: document.document_type, eventDate: document.event_date, createdAt: document.created_at, processingStatus: document.processing_status }));
  const records: TimelineRecord[] = (recordRows ?? []).map((record) => ({ id: record.id, documentId: record.document_id, recordType: record.record_type, reviewStatus: record.review_status, eventDate: record.event_date, values: children.get(record.id) ?? {} }));
  return buildTimeline(documents, records);
}
