import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineDocument, type TimelineRecord } from "@/features/timeline/builder";

const documents: TimelineDocument[] = [{ id: "d1", displayName: "CBC report", documentType: "Lab report", eventDate: null, createdAt: "2026-09-10T10:00:00Z", processingStatus: "completed" }];
function record(reviewStatus: string, values: TimelineRecord["values"] = {}): TimelineRecord { return { id: reviewStatus, documentId: "d1", recordType: "lab", reviewStatus, eventDate: null, values: { test_name: "Hemoglobin", original_value: "13.2", unit: "g/dL", collected_at: null, ...values } }; }

describe("medical timeline builder", () => {
  it("includes approved and corrected facts but excludes extracted and rejected", () => {
    const events = buildTimeline(documents, [record("approved"), record("corrected"), record("extracted"), record("rejected")]);
    expect(events.filter((event) => event.category === "labs")).toHaveLength(2);
  });
  it("uses the medically relevant date before upload date", () => {
    const [event] = buildTimeline([], []); expect(event).toBeUndefined();
    const lab = buildTimeline(documents, [record("approved", { collected_at: "2026-08-01" })]).find((event) => event.category === "labs")!;
    expect(lab).toMatchObject({ date: "2026-08-01", dateLabel: "Event date" });
  });
  it("labels upload-date fallback explicitly", () => {
    const lab = buildTimeline(documents, [record("approved")]).find((event) => event.category === "labs")!;
    expect(lab.dateLabel).toBe("Upload date");
  });
  it("does not invent medication dose or frequency", () => {
    const medication = { ...record("approved", { name: "Aspirin", dose: null, dose_unit: null, frequency: null, start_date: null }), id: "m1", recordType: "medication" };
    const event = buildTimeline(documents, [medication]).find((item) => item.category === "medications")!;
    expect(event.title).toBe("Medication: Aspirin"); expect(event.description).not.toContain("Frequency");
  });
  it("orders newest first and links to source and provenance", () => {
    const second = { ...documents[0], id: "d2", displayName: "New", createdAt: "2026-09-11T10:00:00Z" };
    const events = buildTimeline([documents[0], second], [record("approved")]);
    expect(events[0].id).toBe("document-d2");
    const lab = events.find((event) => event.category === "labs")!;
    expect(lab.sourceHref).toBe("/records/d1"); expect(lab.reviewHref).toBe("/records/d1/review#record-approved");
  });
});
