import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/server/auth/require-user";
import type { Database } from "@/types/database.types";
import {
  buildTimeline,
  type TimelineDocument,
  type TimelineRecord,
} from "./builder";

export async function getTimelineEvents() {
  const { supabase, user } = await requireUser();
  return getTimelineEventsForUser(supabase, user.id);
}

export async function getTimelineEventsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const [{ data: documentRows, error: documentError }, recordResult] =
    await Promise.all([
      supabase
        .from("documents")
        .select(
          "id,display_name,document_type,event_date,created_at,processing_status",
        )
        .eq("user_id", userId),
      supabase
        .from("medical_records")
        .select(
          `
        id,document_id,record_type,review_status,event_date,
        lab_results(test_name,original_value,unit,collected_at),
        medications(name,dose,dose_unit,frequency,start_date),
        diagnoses(name,diagnosed_at),
        allergies(allergen,reaction),
        vitals(label,original_value,unit,measured_at),
        procedures(procedure_name,notes,performed_at),
        doctor_notes(text)
      `,
        )
        .eq("user_id", userId)
        .in("review_status", ["approved", "corrected"]),
    ]);
  const { data: recordRows, error: recordError } = recordResult;
  if (documentError || recordError) throw new Error("TIMELINE_READ_FAILED");
  const documents: TimelineDocument[] = (documentRows ?? []).map(
    (document) => ({
      id: document.id,
      displayName: document.display_name,
      documentType: document.document_type,
      eventDate: document.event_date,
      createdAt: document.created_at,
      processingStatus: document.processing_status,
    }),
  );
  const records: TimelineRecord[] = (recordRows ?? []).map((record) => {
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
      documentId: record.document_id,
      recordType: record.record_type,
      reviewStatus: record.review_status,
      eventDate: record.event_date,
      values: values ?? {},
    };
  });
  return buildTimeline(documents, records);
}
