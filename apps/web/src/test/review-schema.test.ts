import { describe, expect, it } from "vitest";
import { nextDocumentStatus, reviewUpdateSchema } from "@/features/medical-records/review-schema";

const id = "10000000-0000-4000-8000-000000000001";

describe("review updates", () => {
  it("accepts approve and reject without ownership overrides", () => {
    expect(reviewUpdateSchema.safeParse({ action: "approve", recordId: id }).success).toBe(true);
    expect(reviewUpdateSchema.safeParse({ action: "reject", recordId: id, user_id: id }).success).toBe(false);
  });
  it("validates safe lab numeric corrections", () => {
    expect(reviewUpdateSchema.safeParse({ action: "correct", recordId: id, correction: { recordType: "lab", test_name: "Hemoglobin", original_value: "13.5", numeric_value: 13.5, unit: "g/dL", reference_range: "12-16", flag: null } }).success).toBe(true);
    expect(reviewUpdateSchema.safeParse({ action: "correct", recordId: id, correction: { recordType: "lab", test_name: "Hemoglobin", original_value: "not numeric", numeric_value: Number.NaN, unit: null, reference_range: null, flag: null } }).success).toBe(false);
  });
  it("rejects hidden medication and provenance fields", () => {
    expect(reviewUpdateSchema.safeParse({ action: "correct", recordId: id, correction: { recordType: "medication", name: "Metformin", dose: null, dose_unit: null, route: null, frequency: null, duration: null, user_id: id } }).success).toBe(false);
    expect(reviewUpdateSchema.safeParse({ action: "correct", recordId: id, correction: { recordType: "diagnosis", name: "Condition", code: null, status: null }, source_text: "changed" }).success).toBe(false);
  });
  it("completes only when every candidate is reviewed", () => {
    expect(nextDocumentStatus(["approved", "corrected", "rejected"])).toBe("completed");
    expect(nextDocumentStatus(["approved", "extracted"])).toBe("needs_review");
    expect(nextDocumentStatus([])).toBe("needs_review");
  });
});
