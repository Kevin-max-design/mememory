import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/require-user";

export type ReviewRecord = {
  id: string;
  recordType: string;
  reviewStatus: string;
  confidence: number;
  sourcePageNumber: number;
  sourceBlockIds: string[];
  sourceText: string;
  values: Record<string, string | number | null>;
};

export async function getReviewData(documentId: string) {
  const { supabase, user } = await requireUser();
  const { data: document, error } = await supabase.from("documents")
    .select("id,display_name,document_type,event_date,mime_type,file_size,processing_status,created_at,storage_path")
    .eq("id", documentId).eq("user_id", user.id).maybeSingle();
  if (error || !document) notFound();
  const [{ data: pages }, { data: blocks }, { data: records, error: recordError }] = await Promise.all([
    supabase.from("document_pages").select("id,page_number,native_text_used,width,height").eq("document_id", documentId).order("page_number"),
    supabase.from("document_text_blocks").select("id,page_id,block_index,text,source_type,confidence,bbox").eq("document_id", documentId).order("block_index"),
    supabase.from("medical_records").select("id,record_type,review_status,confidence,source_page_number,source_block_ids,source_text").eq("document_id", documentId).order("created_at"),
  ]);
  if (recordError) throw new Error("REVIEW_DATA_READ_FAILED");
  const { data: signedPreview } = await supabase.storage
    .from("medical-records")
    .createSignedUrl(document.storage_path, 300);
  const ids = records?.map((record) => record.id) ?? [];
  const empty = { data: [] as Record<string, unknown>[] };
  const childResults = ids.length ? await Promise.all([
    supabase.from("lab_results").select("*").in("medical_record_id", ids),
    supabase.from("medications").select("*").in("medical_record_id", ids),
    supabase.from("diagnoses").select("*").in("medical_record_id", ids),
    supabase.from("allergies").select("*").in("medical_record_id", ids),
    supabase.from("vitals").select("*").in("medical_record_id", ids),
    supabase.from("procedures").select("*").in("medical_record_id", ids),
    supabase.from("doctor_notes").select("*").in("medical_record_id", ids),
  ]) : [empty, empty, empty, empty, empty, empty, empty];
  if (childResults.some((result) => "error" in result && result.error)) throw new Error("REVIEW_CHILD_READ_FAILED");
  const children = new Map<string, Record<string, string | number | null>>();
  for (const result of childResults) for (const row of result.data ?? []) {
    const value = { ...(row as Record<string, string | number | null>) };
    const recordId = String(value.medical_record_id);
    delete value.id;
    delete value.medical_record_id;
    delete value.user_id;
    children.set(recordId, value);
  }
  return {
    document,
    previewUrl: signedPreview?.signedUrl ?? null,
    pages: pages ?? [],
    blocks: blocks ?? [],
    records: (records ?? []).map((record): ReviewRecord => ({
      id: record.id, recordType: record.record_type, reviewStatus: record.review_status,
      confidence: record.confidence, sourcePageNumber: record.source_page_number,
      sourceBlockIds: record.source_block_ids, sourceText: record.source_text,
      values: children.get(record.id) ?? {},
    })),
  };
}
