import "server-only";
import { requireUser } from "@/server/auth/require-user";
import { getTimelineEvents } from "@/features/timeline/data";
import type { QAEvidence } from "./provider";

const categories: Record<string, QAEvidence["category"] | undefined> = { labs: "lab", medications: "medication", diagnoses: "diagnosis", allergies: "allergy", procedures: "procedure", vitals: "vital", documents: "document" };

export async function getAskEvidence() {
  const events = await getTimelineEvents();
  const { supabase, user } = await requireUser();
  const { data: records, error } = await supabase.from("medical_records").select("id,document_id,source_page_number,source_text").eq("user_id", user.id).in("review_status", ["approved", "corrected"]).limit(200);
  if (error) throw new Error("ASK_EVIDENCE_READ_FAILED");
  const byId = new Map((records ?? []).map((record) => [record.id, record]));
  const documentNames = new Map(events.filter((event) => event.id.startsWith("document-")).map((event) => [event.id.slice(9), event.title]));
  return events.slice(0, 200).flatMap<QAEvidence>((event) => {
    const category = categories[event.category]; if (!category) return [];
    const recordId = event.id.startsWith("record-") ? event.id.slice(7) : null;
    const record = recordId ? byId.get(recordId) : null;
    const documentId = record?.document_id ?? event.id.replace(/^document-/, "");
    return [{ id: event.id, category, title: event.title, detail: event.description, date: event.date, documentId, documentName: documentNames.get(documentId) ?? "Medical record", recordId, pageNumber: record?.source_page_number ?? null, sourceText: record?.source_text ?? event.title, sourceHref: event.reviewHref ?? event.sourceHref }];
  });
}
