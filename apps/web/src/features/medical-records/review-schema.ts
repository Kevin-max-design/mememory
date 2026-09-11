import { z } from "zod";

const text = z.string().trim().min(1).max(500);
const optionalText = z.string().trim().max(500).nullable();
const numeric = z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullable();

const corrections = z.discriminatedUnion("recordType", [
  z.object({ recordType: z.literal("lab"), test_name: text, original_value: text, numeric_value: numeric, unit: optionalText, reference_range: optionalText, flag: optionalText }).strict(),
  z.object({ recordType: z.literal("medication"), name: text, dose: optionalText, dose_unit: optionalText, route: optionalText, frequency: optionalText, duration: optionalText }).strict(),
  z.object({ recordType: z.literal("diagnosis"), name: text, code: optionalText, status: optionalText }).strict(),
  z.object({ recordType: z.literal("allergy"), allergen: text, reaction: optionalText, severity: optionalText, status: optionalText }).strict(),
  z.object({ recordType: z.literal("vital"), measurement_type: z.enum(["blood_pressure", "heart_rate", "temperature", "respiratory_rate", "oxygen_saturation", "height", "weight", "BMI", "other"]), label: text, original_value: text, numeric_value: numeric, secondary_value: numeric, unit: optionalText }).strict(),
  z.object({ recordType: z.literal("procedure"), procedure_name: text, performed_at: z.iso.date().nullable(), notes: optionalText }).strict(),
  z.object({ recordType: z.literal("doctor_note"), text: z.string().trim().min(1).max(10_000) }).strict(),
]);

export const reviewUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["approve", "reject"]), recordId: z.uuid() }).strict(),
  z.object({ action: z.literal("correct"), recordId: z.uuid(), correction: corrections }).strict(),
]);

export type ReviewUpdate = z.infer<typeof reviewUpdateSchema>;

export function nextDocumentStatus(statuses: string[]) {
  return statuses.length > 0 && statuses.every((status) => status !== "extracted")
    ? "completed"
    : "needs_review";
}
