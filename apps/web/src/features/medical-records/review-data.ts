import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { recordAuditEvent } from "@/features/audit/server";
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

export async function getDocumentOverview(documentId: string) {
  if (!z.uuid().safeParse(documentId).success) notFound();
  const { supabase, user } = await requireUser();
  const { data: document, error } = await supabase
    .from("documents")
    .select(
      "id,display_name,document_type,event_date,mime_type,file_size,processing_status,created_at",
    )
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !document) notFound();

  const [recordsResult, pagesResult] = await Promise.all([
    supabase
      .from("medical_records")
      .select("review_status")
      .eq("document_id", documentId)
      .eq("user_id", user.id),
    supabase
      .from("document_pages")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId),
    recordAuditEvent({
      actorUserId: user.id,
      action: "document.viewed",
      resourceType: "document",
      resourceId: document.id,
      status: "succeeded",
      metadata: { source_route: "/records/detail" },
    }),
  ]);
  if (recordsResult.error || pagesResult.error)
    throw new Error("RECORD_OVERVIEW_READ_FAILED");
  const statuses = recordsResult.data ?? [];
  return {
    document,
    pageCount: pagesResult.count ?? 0,
    candidateCount: statuses.length,
    pendingCount: statuses.filter(
      (record) => record.review_status === "extracted",
    ).length,
    approvedCount: statuses.filter(
      (record) =>
        record.review_status === "approved" ||
        record.review_status === "corrected",
    ).length,
    rejectedCount: statuses.filter(
      (record) => record.review_status === "rejected",
    ).length,
  };
}

export async function getReviewData(documentId: string) {
  if (!z.uuid().safeParse(documentId).success) notFound();
  const { supabase, user } = await requireUser();
  const [documentResult, pagesResult, blocksResult, recordsResult] =
    await Promise.all([
      supabase
        .from("documents")
        .select(
          "id,display_name,document_type,event_date,mime_type,file_size,processing_status,created_at,storage_path",
        )
        .eq("id", documentId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("document_pages")
        .select("id,page_number,native_text_used,width,height")
        .eq("document_id", documentId)
        .order("page_number"),
      supabase
        .from("document_text_blocks")
        .select("id,page_id,block_index,text,source_type,confidence,bbox")
        .eq("document_id", documentId)
        .order("block_index"),
      supabase
        .from("medical_records")
        .select(
          `
          id,record_type,review_status,confidence,source_page_number,source_block_ids,source_text,
          lab_results(test_name,original_value,numeric_value,unit,reference_range,flag,collected_at),
          medications(name,dose,dose_unit,route,frequency,duration,start_date,status),
          diagnoses(name,code,status,diagnosed_at),
          allergies(allergen,reaction,severity,status),
          vitals(measurement_type,label,original_value,numeric_value,secondary_value,unit,measured_at),
          procedures(procedure_name,performed_at,notes),
          doctor_notes(text)
        `,
        )
        .eq("document_id", documentId)
        .eq("user_id", user.id)
        .order("created_at"),
    ]);
  const { data: document, error } = documentResult;
  if (error || !document) notFound();
  const { data: pages, error: pagesError } = pagesResult;
  const { data: blocks, error: blocksError } = blocksResult;
  const { data: records, error: recordError } = recordsResult;
  if (pagesError || blocksError || recordError)
    throw new Error("REVIEW_DATA_READ_FAILED");
  const [signedPreviewResult] = await Promise.all([
    supabase.storage
      .from("medical-records")
      .createSignedUrl(document.storage_path, 300),
    recordAuditEvent({
      actorUserId: user.id,
      action: "document.viewed",
      resourceType: "document",
      resourceId: document.id,
      status: "succeeded",
      metadata: { source_route: "/records/review" },
    }),
  ]);
  const signedPreview = signedPreviewResult.data;
  if (signedPreview?.signedUrl) {
    await recordAuditEvent({
      actorUserId: user.id,
      action: "document.preview_requested",
      resourceType: "document",
      resourceId: document.id,
      status: "succeeded",
      metadata: {
        mime_type: document.mime_type,
        source_route: "/records/review",
      },
    });
  }
  return {
    document,
    previewUrl: signedPreview?.signedUrl ?? null,
    pages: pages ?? [],
    blocks: blocks ?? [],
    records: (records ?? []).map((record): ReviewRecord => {
      const values =
        record.record_type === "lab"
          ? record.lab_results[0]
          : record.record_type === "medication"
            ? record.medications[0]
            : record.record_type === "diagnosis"
              ? record.diagnoses[0]
              : record.record_type === "allergy"
                ? record.allergies[0]
                : record.record_type === "vital"
                  ? record.vitals[0]
                  : record.record_type === "procedure"
                    ? record.procedures[0]
                    : record.record_type === "doctor_note"
                      ? record.doctor_notes[0]
                      : undefined;
      return {
        id: record.id,
        recordType: record.record_type,
        reviewStatus: record.review_status,
        confidence: record.confidence,
        sourcePageNumber: record.source_page_number,
        sourceBlockIds: record.source_block_ids,
        sourceText: record.source_text,
        values: values ?? {},
      };
    }),
  };
}
