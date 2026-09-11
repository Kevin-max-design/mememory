import { createHash } from "node:crypto";
import type {
  CandidateData,
  ExtractionBlock,
  ExtractionCandidate,
  ExtractionConfidence,
  ExtractionProvider,
  RecordKind,
} from "./types";
import { ExtractionError } from "./types";

const VERSION = "1.0.0";
const LABS: [RegExp, string][] = [
  [/^(?:ha?emoglobin|hgb)\b/i, "Hemoglobin"],
  [/^(?:total\s+)?wbc(?:\s+count)?\b/i, "WBC"],
  [/^platelet(?:\s+count)?\b/i, "Platelet Count"],
  [/^rbc(?:\s+count)?\b/i, "RBC Count"],
  [/^(?:hematocrit|hct|pcv)\b/i, "Hematocrit"],
  [/^mcv\b/i, "MCV"], [/^mchc\b/i, "MCHC"], [/^mch\b/i, "MCH"],
  [/^(?:fasting blood sugar|fbs)\b/i, "Fasting Blood Sugar"],
  [/^(?:random blood sugar|rbs)\b/i, "Random Blood Sugar"],
  [/^hba1c\b/i, "HbA1c"], [/^creatinine\b/i, "Creatinine"],
  [/^urea\b/i, "Urea"], [/^(?:sgpt|alt)\b/i, "ALT"],
  [/^(?:sgot|ast)\b/i, "AST"], [/^triglycerides?\b/i, "Triglycerides"],
  [/^(?:total\s+)?cholesterol\b/i, "Cholesterol"],
];

const NUMBER = "[-+]?\\d+(?:\\.\\d+)?";
const UNIT = "(?:g/dL|mg/dL|mmol/L|mEq/L|IU/L|U/L|fL|pg|%|x?10\\^?[369]/(?:uL|µL)|cells/(?:uL|µL))";

function fingerprint(documentId: string, kind: RecordKind, page: number, data: CandidateData, text: string) {
  return createHash("sha256")
    .update(JSON.stringify([documentId, kind, page, data, text.trim().replace(/\s+/g, " ").toLowerCase()]))
    .digest("hex");
}

function candidate(
  documentId: string,
  block: ExtractionBlock,
  recordType: RecordKind,
  confidence: ExtractionConfidence,
  sourceText: string,
  data: CandidateData,
): ExtractionCandidate {
  if (!block.id || !block.pageNumber || !sourceText.trim()) {
    throw new ExtractionError("EXTRACTION_PROVENANCE_MISSING", "An extracted record is missing source provenance.");
  }
  return {
    recordType,
    eventDate: null,
    confidence,
    sourceDocumentId: documentId,
    sourcePageNumber: block.pageNumber,
    sourceBlockIds: [block.id],
    sourceText: sourceText.trim(),
    extractionMethod: "deterministic",
    extractionVersion: VERSION,
    fingerprint: fingerprint(documentId, recordType, block.pageNumber, data, sourceText),
    data,
  };
}

function safeNumber(value: string): number | null {
  return /^[-+]?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
}

function labs(documentId: string, block: ExtractionBlock, line: string) {
  for (const [label, testName] of LABS) {
    const match = line.match(label);
    if (!match) continue;
    const remainder = line.slice(match[0].length).replace(/^\s*[:=-]?\s*/, "");
    const value = remainder.match(new RegExp(`^(${NUMBER})(?:\\s*(${UNIT}))?`, "i"));
    if (!value) return [];
    const trailing = remainder.slice(value[0].length).trim();
    const range = trailing.match(new RegExp(`(?:ref(?:erence)?(?:\\s+range)?[:\\s]*)?(${NUMBER}\\s*(?:-|–|to)\\s*${NUMBER})(?:\\s*${UNIT})?`, "i"));
    const flag = trailing.match(/\b(high|low|critical|abnormal|H|L)\b/i)?.[1] ?? null;
    return [candidate(documentId, block, "lab", "high", line, {
      test_name: testName,
      original_value: value[1],
      numeric_value: safeNumber(value[1]),
      unit: value[2] ?? null,
      reference_range: range?.[1] ?? null,
      flag,
      specimen: null,
      collected_at: null,
    })];
  }
  return [];
}

function medication(documentId: string, block: ExtractionBlock, line: string) {
  const match = line.match(/^(?:medication|medicine|rx|prescribed)\s*[:\-]\s*(.+)$/i);
  if (!match) return [];
  const body = match[1].trim();
  const name = body.match(/^([A-Za-z][A-Za-z0-9 .'-]*?)(?=\s+\d|\s+(?:once|twice|thrice|daily|weekly|at bedtime)\b|$)/i)?.[1]?.trim();
  if (!name) return [];
  const dose = body.match(new RegExp(`\\b(${NUMBER})\\s*(mg|mcg|g|mL|IU)\\b`, "i"));
  const frequency = body.match(/\b(once daily|twice daily|thrice daily|daily|weekly|at bedtime|every \d+ hours|\d+ times daily)\b/i)?.[1] ?? null;
  const route = body.match(/\b(oral|intravenous|intramuscular|subcutaneous|topical|inhaled)\b/i)?.[1] ?? null;
  return [candidate(documentId, block, "medication", dose || frequency ? "high" : "medium", line, {
    name,
    generic_name: null,
    dose: dose?.[1] ?? null,
    dose_unit: dose?.[2] ?? null,
    route,
    frequency,
    duration: null,
    start_date: null,
    end_date: null,
    status: null,
  })];
}

function diagnosis(documentId: string, block: ExtractionBlock, line: string) {
  const match = line.match(/^(?:diagnosis|impression|assessment|known case of|past history of|diagnosed with)\s*[:\-]?\s*(.+)$/i);
  if (!match || !match[1].trim()) return [];
  return [candidate(documentId, block, "diagnosis", "high", line, {
    name: match[1].trim(), code: null, diagnosed_at: null, status: null,
  })];
}

function allergy(documentId: string, block: ExtractionBlock, line: string) {
  if (/\b(?:no known (?:drug )?allerg(?:y|ies)|nkda|no allergies)\b/i.test(line)) return [];
  const match = line.match(/^(?:allergy|allergies|allergic to)\s*[:\-]?\s*([^,;:-]+)(?:\s*[-:]\s*(.+))?$/i);
  if (!match) return [];
  return [candidate(documentId, block, "allergy", "high", line, {
    allergen: match[1].trim(), reaction: match[2]?.trim() ?? null, severity: null, status: null,
  })];
}

function vitals(documentId: string, block: ExtractionBlock, line: string) {
  const results: ExtractionCandidate[] = [];
  const patterns: [RegExp, string, string, string | null][] = [
    [/\b(?:BP|blood pressure)\s*[:=-]?\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*(mmHg)?\b/i, "blood_pressure", "Blood pressure", "mmHg"],
    [/\b(?:pulse|heart rate|HR)\s*[:=-]?\s*(\d{2,3})\s*(bpm)?\b/i, "heart_rate", "Heart rate", "bpm"],
    [/\b(?:temperature|temp)\s*[:=-]?\s*(\d{2,3}(?:\.\d+)?)\s*°?\s*([FC])\b/i, "temperature", "Temperature", null],
    [/\b(?:SpO2|oxygen saturation)\s*[:=-]?\s*(\d{1,3})\s*(%)?\b/i, "oxygen_saturation", "SpO2", "%"],
    [/\b(?:respiratory rate|RR)\s*[:=-]?\s*(\d{1,3})\s*(?:\/min|breaths\/min)?\b/i, "respiratory_rate", "Respiratory rate", "breaths/min"],
    [/\bheight\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(cm|m|in)\b/i, "height", "Height", null],
    [/\bweight\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(kg|lb)\b/i, "weight", "Weight", null],
    [/\bBMI\s*[:=-]?\s*(\d+(?:\.\d+)?)\b/i, "BMI", "BMI", "kg/m²"],
  ];
  for (const [pattern, measurementType, label, defaultUnit] of patterns) {
    const match = line.match(pattern);
    if (!match) continue;
    results.push(candidate(documentId, block, "vital", "high", match[0], {
      measurement_type: measurementType,
      label,
      original_value: measurementType === "blood_pressure" ? `${match[1]}/${match[2]}` : match[1],
      numeric_value: safeNumber(match[1]),
      secondary_value: measurementType === "blood_pressure" ? safeNumber(match[2]) : null,
      unit: measurementType === "temperature" ? match[2].toUpperCase() : (match[3] ?? match[2] ?? defaultUnit),
      measured_at: null,
    }));
  }
  return results;
}

function procedure(documentId: string, block: ExtractionBlock, line: string) {
  const match = line.match(/^(?:procedure|procedure performed|operation)\s*[:\-]\s*(.+)$/i);
  if (!match) return [];
  return [candidate(documentId, block, "procedure", "high", line, {
    procedure_name: match[1].trim(), performed_at: null, notes: null,
  })];
}

function note(documentId: string, block: ExtractionBlock, line: string) {
  const match = line.match(/^(?:doctor note|clinical note|notes?)\s*[:\-]\s*(.+)$/i);
  return match ? [candidate(documentId, block, "doctor_note", "medium", line, { text: match[1].trim() })] : [];
}

export class DeterministicExtractionProvider implements ExtractionProvider {
  readonly name = "deterministic";
  readonly version = VERSION;

  extract(documentId: string, blocks: ExtractionBlock[]): ExtractionCandidate[] {
    if (!blocks.some((block) => block.text.trim())) {
      throw new ExtractionError("EXTRACTION_NO_TEXT", "No text is available for structured extraction.");
    }
    const found: ExtractionCandidate[] = [];
    for (const block of blocks) {
      for (const rawLine of block.text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        found.push(...labs(documentId, block, line));
        found.push(...medication(documentId, block, line));
        found.push(...diagnosis(documentId, block, line));
        found.push(...allergy(documentId, block, line));
        found.push(...vitals(documentId, block, line));
        found.push(...procedure(documentId, block, line));
        found.push(...note(documentId, block, line));
      }
    }
    return [...new Map(found.map((item) => [item.fingerprint, item])).values()];
  }
}

export class OllamaExtractionProvider implements ExtractionProvider {
  readonly name = "ollama";
  readonly version = "unavailable";
  extract(): ExtractionCandidate[] {
    throw new ExtractionError("EXTRACTION_FAILED", "The optional Ollama extraction provider is unavailable.");
  }
}
