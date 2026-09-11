import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositeQAProvider, DeterministicQAProvider, OllamaQAProvider, createQAProvider, type QAEvidence, type QAProvider } from "@/features/ask/provider";

const evidence: QAEvidence[] = [
  { id: "med", category: "medication", title: "Medication: Metformin 500 mg", detail: "Frequency: twice daily", date: "2026-01-01", documentId: "d1", documentName: "Discharge summary", recordId: "r1", pageNumber: 1, sourceText: "Medication: Metformin 500 mg twice daily", sourceHref: "/records/d1/review#record-r1" },
  { id: "lab-old", category: "lab", title: "Creatinine — 1.0 mg/dL", detail: "From renal panel", date: "2025-01-01", documentId: "d1", documentName: "Renal panel", recordId: "r2", pageNumber: 1, sourceText: "Creatinine 1.0 mg/dL", sourceHref: "/records/d1/review#record-r2" },
  { id: "lab-new", category: "lab", title: "Creatinine — 1.1 mg/dL", detail: "From renal panel", date: "2026-01-01", documentId: "d1", documentName: "Renal panel", recordId: "r3", pageNumber: 2, sourceText: "Creatinine 1.1 mg/dL", sourceHref: "/records/d1/review#record-r3" },
  { id: "dx", category: "diagnosis", title: "Diagnosis: Type 2 diabetes", detail: "From discharge summary", date: null, documentId: "d1", documentName: "Discharge summary", recordId: "r4", pageNumber: 2, sourceText: "Diagnosis: Type 2 diabetes", sourceHref: "/records/d1/review#record-r4" },
  { id: "allergy", category: "allergy", title: "Allergy: Penicillin", detail: "rash", date: null, documentId: "d1", documentName: "Discharge summary", recordId: "r5", pageNumber: 2, sourceText: "Allergy: Penicillin - rash", sourceHref: "/records/d1/review#record-r5" },
  { id: "procedure", category: "procedure", title: "Procedure: ECG", detail: "From report", date: null, documentId: "d1", documentName: "ECG report", recordId: "r6", pageNumber: 1, sourceText: "Procedure: ECG", sourceHref: "/records/d1/review#record-r6" },
  { id: "vital", category: "vital", title: "Blood pressure: 120/80 mmHg", detail: "From report", date: "2026-01-02", documentId: "d1", documentName: "Vitals", recordId: "r7", pageNumber: 1, sourceText: "BP 120/80", sourceHref: "/records/d1/review#record-r7" },
  { id: "document-d1", category: "document", title: "CBC report", detail: "Lab report", date: "2026-01-01", documentId: "d1", documentName: "CBC report", recordId: null, pageNumber: null, sourceText: "CBC report", sourceHref: "/records/d1" },
];
const provider = new DeterministicQAProvider();

describe("Ask MedMemory", () => {
  it("answers medication history and specific medication questions", async () => {
    expect((await provider.answer("What medicines have I taken?", evidence)).evidence.map((item) => item.id)).toEqual(["med"]);
    expect((await provider.answer("Was I prescribed Metformin?", evidence)).answer).toContain("Metformin 500 mg");
  });
  it("answers lab history and chooses the latest clinical date", async () => {
    const answer = await provider.answer("What was my latest creatinine?", evidence);
    expect(answer.evidence.map((item) => item.id)).toEqual(["lab-new"]); expect(answer.answer).toContain("1.1 mg/dL");
  });
  it("uses only explicit diagnosis evidence", async () => {
    expect((await provider.answer("Do my records mention diabetes?", evidence)).evidence.map((item) => item.id)).toEqual(["dx"]);
    const kidney = await provider.answer("Do I have kidney disease?", evidence);
    expect(kidney.noEvidence).toBe(true); expect(kidney.answer).toContain("related records"); expect(kidney.evidence.every((item) => item.category === "lab")).toBe(true);
  });
  it("answers allergy, procedure, vital, and document questions", async () => {
    expect((await provider.answer("What allergies are documented?", evidence)).evidence[0].id).toBe("allergy");
    expect((await provider.answer("What procedures are in my records?", evidence)).evidence[0].id).toBe("procedure");
    expect((await provider.answer("What was my last BP?", evidence)).evidence[0].id).toBe("vital");
    expect((await provider.answer("Find my CBC report", evidence)).evidence[0].id).toBe("document-d1");
  });
  it("refuses unsupported questions without inventing facts", async () => {
    const answer = await provider.answer("Should I change my treatment?", evidence);
    expect(answer.noEvidence).toBe(true); expect(answer.evidence).toEqual([]);
  });
  it("returns provenance with every factual answer", async () => {
    const answer = await provider.answer("Show my medications", evidence);
    expect(answer.evidence.every((item) => item.sourceText && item.sourceHref.includes(item.documentId))).toBe(true);
  });
  it("falls back when Ollama is unavailable", async () => {
    const unavailable: QAProvider = { answer: vi.fn().mockRejectedValue(new Error("offline")) };
    const answer = await new CompositeQAProvider(provider, unavailable).answer("Explain this differently", evidence);
    expect(answer.method).toBe("deterministic"); expect(answer.noEvidence).toBe(true);
  });
  it("rejects invalid Ollama output and falls back safely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: "unsupported claim", evidence_ids: ["missing"] }) }));
    const answer = await new CompositeQAProvider(provider, new OllamaQAProvider("http://127.0.0.1:11434/api")).answer("Explain this differently", evidence);
    expect(answer.method).toBe("deterministic"); expect(answer.noEvidence).toBe(true);
  });
  it("accepts only loopback Ollama endpoints", () => {
    expect(createQAProvider("https://remote.example/api")).toBeInstanceOf(CompositeQAProvider);
  });
});

afterEach(() => vi.unstubAllGlobals());
