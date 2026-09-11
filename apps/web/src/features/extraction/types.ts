export const extractionErrorCodes = [
  "EXTRACTION_FAILED",
  "EXTRACTION_INVALID_OUTPUT",
  "EXTRACTION_NO_TEXT",
  "EXTRACTION_PROVENANCE_MISSING",
  "EXTRACTION_PERSISTENCE_FAILED",
] as const;

export type ExtractionConfidence = "high" | "medium" | "low";
export type RecordKind =
  | "lab"
  | "medication"
  | "diagnosis"
  | "allergy"
  | "vital"
  | "procedure"
  | "doctor_note";

export type ExtractionBlock = {
  id: string;
  pageNumber: number;
  text: string;
};

export type CandidateData = Record<string, string | number | null>;

export type ExtractionCandidate = {
  recordType: RecordKind;
  eventDate: string | null;
  confidence: ExtractionConfidence;
  sourceDocumentId: string;
  sourcePageNumber: number;
  sourceBlockIds: string[];
  sourceText: string;
  extractionMethod: string;
  extractionVersion: string;
  fingerprint: string;
  data: CandidateData;
};

export interface ExtractionProvider {
  readonly name: string;
  readonly version: string;
  extract(documentId: string, blocks: ExtractionBlock[]): ExtractionCandidate[];
}

export class ExtractionError extends Error {
  constructor(
    readonly code: (typeof extractionErrorCodes)[number],
    readonly safeMessage: string,
  ) {
    super(code);
  }
}
