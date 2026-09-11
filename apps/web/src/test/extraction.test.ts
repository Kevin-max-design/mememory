import { describe, expect, it, vi } from "vitest";
import { DeterministicExtractionProvider, ExtractionError } from "@/features/extraction";

const provider = new DeterministicExtractionProvider();
const documentId = "20000000-0000-4000-8000-000000000002";
const blockId = "70000000-0000-4000-8000-000000000007";

function extract(text: string) {
  return provider.extract(documentId, [{ id: blockId, pageNumber: 1, text }]);
}

describe("deterministic structured extraction", () => {
  it("extracts CBC values with units and reference ranges", () => {
    const records = extract([
      "Hemoglobin 13.5 g/dL 12.0-16.0",
      "Total WBC Count 7.2 x10^3/uL Ref: 4.0-11.0",
      "Platelet Count 250 x10^3/uL 150-450",
      "Hematocrit 41 % 36-46",
    ].join("\n"));
    expect(records.map((record) => record.data.test_name)).toEqual([
      "Hemoglobin", "WBC", "Platelet Count", "Hematocrit",
    ]);
    expect(records[0].data).toMatchObject({ numeric_value: 13.5, unit: "g/dL", reference_range: "12.0-16.0" });
    expect(records[1].data.unit).toBe("x10^3/uL");
  });

  it("does not parse unsafe numeric values", () => {
    expect(extract("Hemoglobin trace g/dL")).toEqual([]);
  });

  it("extracts stated medication fields without inventing omitted fields", () => {
    const detailed = extract("Medication: Metformin 500 mg twice daily oral")[0];
    expect(detailed.data).toMatchObject({ name: "Metformin", dose: "500", dose_unit: "mg", frequency: "twice daily", route: "oral" });
    const nameOnly = extract("Medication: Aspirin")[0];
    expect(nameOnly.data).toMatchObject({ name: "Aspirin", dose: null, dose_unit: null, frequency: null, route: null });
  });

  it("requires an explicit diagnosis label and never diagnoses from a lab", () => {
    expect(extract("Diagnosis: Type 2 diabetes mellitus")[0].data.name).toBe("Type 2 diabetes mellitus");
    expect(extract("HbA1c 12.0 % High").some((record) => record.recordType === "diagnosis")).toBe(false);
  });

  it("extracts positive allergies and skips negative declarations", () => {
    expect(extract("Allergy: Penicillin - rash")[0].data).toMatchObject({ allergen: "Penicillin", reaction: "rash" });
    expect(extract("No known drug allergies")).toEqual([]);
  });

  it("extracts multiple vitals from one line", () => {
    const records = extract("BP 120/80 mmHg Pulse 72 bpm Temperature 98.6 F SpO2 98%");
    expect(records.map((record) => record.data.measurement_type)).toEqual([
      "blood_pressure", "heart_rate", "temperature", "oxygen_saturation",
    ]);
    expect(records[0].data).toMatchObject({ numeric_value: 120, secondary_value: 80, unit: "mmHg" });
  });

  it("extracts only clearly labelled procedures and notes", () => {
    expect(extract("Procedure: Electrocardiogram")[0].data.procedure_name).toBe("Electrocardiogram");
    expect(extract("Doctor note: Follow up in two weeks")[0].data.text).toBe("Follow up in two weeks");
  });

  it("attaches complete provenance and stable fingerprints", () => {
    const first = extract("Creatinine 1.0 mg/dL 0.6-1.2")[0];
    const second = extract("Creatinine 1.0 mg/dL 0.6-1.2")[0];
    expect(first).toMatchObject({
      sourceDocumentId: documentId,
      sourcePageNumber: 1,
      sourceBlockIds: [blockId],
      sourceText: "Creatinine 1.0 mg/dL 0.6-1.2",
      extractionMethod: "deterministic",
      extractionVersion: "1.0.0",
    });
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("fails explicitly for empty text or missing provenance", () => {
    expect(() => extract("   ")).toThrowError(expect.objectContaining({ code: "EXTRACTION_NO_TEXT" }));
    expect(() => provider.extract(documentId, [{ id: "", pageNumber: 1, text: "WBC 7 U/L" }])).toThrowError(
      expect.objectContaining<Partial<ExtractionError>>({ code: "EXTRACTION_PROVENANCE_MISSING" }),
    );
  });

  it("does not log raw medical text", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    extract("Diagnosis: Synthetic condition");
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });
});
