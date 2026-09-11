export type TimelineCategory = "labs" | "medications" | "diagnoses" | "allergies" | "vitals" | "procedures" | "notes" | "documents";

export type TimelineDocument = { id: string; displayName: string; documentType: string | null; eventDate: string | null; createdAt: string; processingStatus: string };
export type TimelineRecord = { id: string; documentId: string; recordType: string; reviewStatus: string; eventDate: string | null; values: Record<string, string | number | null> };
export type TimelineEvent = { id: string; category: TimelineCategory; eventType: string; title: string; description: string; date: string; dateLabel: "Event date" | "Upload date"; reviewStatus: string; sourceHref: string; reviewHref: string | null };

function shown(value: unknown) { return value === null || value === undefined || value === "" ? null : String(value); }

export function buildTimeline(documents: TimelineDocument[], records: TimelineRecord[]): TimelineEvent[] {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const events: TimelineEvent[] = documents.map((document) => ({
    id: `document-${document.id}`, category: "documents", eventType: "Document",
    title: document.displayName,
    description: document.documentType ?? "Uploaded medical document",
    date: document.eventDate ?? document.createdAt,
    dateLabel: document.eventDate ? "Event date" : "Upload date",
    reviewStatus: document.processingStatus,
    sourceHref: `/records/${document.id}`, reviewHref: document.processingStatus === "needs_review" ? `/records/${document.id}/review` : null,
  }));
  for (const record of records) {
    if (record.reviewStatus !== "approved" && record.reviewStatus !== "corrected") continue;
    const document = byId.get(record.documentId);
    if (!document) continue;
    const v = record.values;
    let category: TimelineCategory; let title: string; let description = `From ${document.displayName}`; let medicalDate: string | null = record.eventDate;
    switch (record.recordType) {
      case "lab": {
        category = "labs"; const unit = shown(v.unit); title = `${shown(v.test_name) ?? "Lab result"} — ${shown(v.original_value) ?? "Value recorded"}${unit ? ` ${unit}` : ""}`; medicalDate = shown(v.collected_at) ?? medicalDate; break;
      }
      case "medication": {
        category = "medications"; const dose = [shown(v.dose), shown(v.dose_unit)].filter(Boolean).join(" "); title = `Medication: ${shown(v.name) ?? "Medication"}${dose ? ` ${dose}` : ""}`; const frequency = shown(v.frequency); if (frequency) description = `Frequency: ${frequency} · From ${document.displayName}`; medicalDate = shown(v.start_date) ?? medicalDate; break;
      }
      case "diagnosis": category = "diagnoses"; title = `Diagnosis: ${shown(v.name) ?? "Reviewed diagnosis"}`; medicalDate = shown(v.diagnosed_at) ?? medicalDate; break;
      case "allergy": category = "allergies"; title = `Allergy: ${shown(v.allergen) ?? "Reviewed allergy"}`; if (shown(v.reaction)) description = `Reaction: ${shown(v.reaction)} · From ${document.displayName}`; break;
      case "vital": category = "vitals"; title = `${shown(v.label) ?? "Vital"}: ${shown(v.original_value) ?? "Value recorded"}${shown(v.unit) ? ` ${shown(v.unit)}` : ""}`; medicalDate = shown(v.measured_at) ?? medicalDate; break;
      case "procedure": category = "procedures"; title = `Procedure: ${shown(v.procedure_name) ?? "Reviewed procedure"}`; if (shown(v.notes)) description = `${shown(v.notes)} · From ${document.displayName}`; medicalDate = shown(v.performed_at) ?? medicalDate; break;
      case "doctor_note": category = "notes"; title = "Doctor note"; description = shown(v.text) ?? description; break;
      default: continue;
    }
    const date = medicalDate ?? document.eventDate ?? document.createdAt;
    events.push({ id: `record-${record.id}`, category, eventType: record.recordType, title, description, date, dateLabel: medicalDate || document.eventDate ? "Event date" : "Upload date", reviewStatus: record.reviewStatus, sourceHref: `/records/${record.documentId}`, reviewHref: `/records/${record.documentId}/review#record-${record.id}` });
  }
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.id.localeCompare(b.id));
}
