import { z } from "zod";

export type QAEvidence = {
  id: string; category: "medication" | "lab" | "diagnosis" | "allergy" | "procedure" | "vital" | "document";
  title: string; detail: string; date: string | null; documentId: string; documentName: string;
  recordId: string | null; pageNumber: number | null; sourceText: string; sourceHref: string;
};
export type QAAnswer = { answer: string; evidence: QAEvidence[]; method: "deterministic" | "ollama"; noEvidence: boolean };
export interface QAProvider { answer(question: string, evidence: QAEvidence[]): Promise<QAAnswer>; }

const noEvidence = (evidence: QAEvidence[] = []): QAAnswer => ({
  answer: evidence.length ? "I found related records, but I could not find reviewed records that establish this diagnosis." : "I could not find reviewed records that establish this. You may need to upload or review relevant records first.",
  evidence, method: "deterministic", noEvidence: true,
});
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const list = (items: QAEvidence[]) => items.map((item) => item.date ? `${item.title} (${new Date(item.date).toLocaleDateString("en-CA")})` : item.title).join("; ");

export class DeterministicQAProvider implements QAProvider {
  async answer(question: string, evidence: QAEvidence[]): Promise<QAAnswer> {
    const q = normalized(question);
    const by = (category: QAEvidence["category"]) => evidence.filter((item) => item.category === category);
    let matches: QAEvidence[] = []; let answer = "";
    if (/\b(medicine|medicines|medication|medications|prescribed|drugs?)\b/.test(q)) {
      matches = by("medication").filter((item) => !/\bwas i prescribed\b/.test(q) || q.includes(normalized(item.title.replace(/^Medication:\s*/i, "").split(/\s+\d/)[0])));
      answer = matches.length ? `Your reviewed records list: ${list(matches)}.` : "";
    } else if (/\b(lab|labs|platelet|hba1c|creatinine|hemoglobin|haemoglobin|wbc|cholesterol|sugar|urea)\b/.test(q)) {
      const all = by("lab"); const term = ["platelet", "hba1c", "creatinine", "hemoglobin", "haemoglobin", "wbc", "cholesterol", "sugar", "urea"].find((value) => q.includes(value));
      matches = term ? all.filter((item) => normalized(item.title).includes(term === "haemoglobin" ? "hemoglobin" : term)) : all;
      if (q.includes("latest") && matches.length) matches = [...matches].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 1);
      answer = matches.length ? `I found these reviewed lab results: ${list(matches)}.` : "";
    } else if (/\b(diagnos|condition|diabetes|kidney disease)\b/.test(q)) {
      const all = by("diagnosis"); const specific = q.includes("kidney") ? "kidney" : q.includes("diabetes") ? "diabetes" : null;
      matches = specific ? all.filter((item) => normalized(item.title).includes(specific)) : all;
      if (!matches.length && q.includes("kidney")) {
        const related = by("lab").filter((item) => /creatinine|urea/i.test(item.title));
        return noEvidence(related);
      }
      answer = matches.length ? `Your reviewed records explicitly list: ${list(matches)}.` : "";
    } else if (/\ballerg/.test(q)) { matches = by("allergy"); answer = matches.length ? `Documented reviewed allergies: ${list(matches)}.` : "";
    } else if (/\b(procedure|procedures|operation|surgery)\b/.test(q)) { matches = by("procedure"); answer = matches.length ? `Reviewed procedures: ${list(matches)}.` : "";
    } else if (/\b(bp|blood pressure|pulse|heart rate|weight|height|bmi|spo2|oxygen|temperature|vitals?)\b/.test(q)) {
      const all = by("vital"); const term = q.includes("blood pressure") || /\bbp\b/.test(q) ? "blood pressure" : ["pulse", "weight", "height", "bmi", "spo2", "temperature"].find((value) => q.includes(value));
      matches = term ? all.filter((item) => normalized(item.title).includes(term === "pulse" ? "heart rate" : term)) : all;
      if ((q.includes("last") || q.includes("latest")) && matches.length) matches = [...matches].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 1);
      answer = matches.length ? `I found these reviewed vital measurements: ${list(matches)}.` : "";
    } else if (/\b(report|reports|record|records|summary|summaries|discharge|cbc)\b/.test(q)) {
      matches = by("document").filter((item) => q.includes("cbc") ? normalized(item.title).includes("cbc") : q.includes("discharge") ? normalized(item.title).includes("discharge") : true);
      answer = matches.length ? `I found these documents: ${list(matches)}.` : "";
    }
    return answer && matches.length ? { answer, evidence: matches, method: "deterministic", noEvidence: false } : noEvidence();
  }
}

const ollamaSchema = z.object({ answer: z.string().trim().min(1).max(1500), evidence_ids: z.array(z.string()).min(1).max(10) }).strict();
export class OllamaQAProvider implements QAProvider {
  constructor(private readonly endpoint: string | null) {}
  async answer(question: string, evidence: QAEvidence[]): Promise<QAAnswer> {
    if (!this.endpoint) throw new Error("OLLAMA_UNAVAILABLE");
    const response = await fetch(this.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, evidence: evidence.map(({ id, title, detail, date }) => ({ id, title, detail, date })) }) });
    if (!response.ok) throw new Error("OLLAMA_UNAVAILABLE");
    const parsed = ollamaSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("OLLAMA_INVALID_OUTPUT");
    const selected = parsed.data.evidence_ids.map((id) => evidence.find((item) => item.id === id)).filter((item): item is QAEvidence => Boolean(item));
    if (selected.length !== parsed.data.evidence_ids.length) throw new Error("OLLAMA_INVALID_OUTPUT");
    return { answer: parsed.data.answer, evidence: selected, method: "ollama", noEvidence: false };
  }
}

export class CompositeQAProvider implements QAProvider {
  constructor(private readonly deterministic = new DeterministicQAProvider(), private readonly ollama?: QAProvider) {}
  async answer(question: string, evidence: QAEvidence[]) {
    const base = await this.deterministic.answer(question, evidence);
    if (!base.noEvidence || !this.ollama || evidence.length === 0) return base;
    try { return await this.ollama.answer(question, evidence); } catch { return base; }
  }
}

export function createQAProvider(ollamaUrl = process.env.OLLAMA_URL) {
  if (!ollamaUrl) return new CompositeQAProvider();
  try {
    const url = new URL(ollamaUrl);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) return new CompositeQAProvider();
    return new CompositeQAProvider(new DeterministicQAProvider(), new OllamaQAProvider(url.toString()));
  } catch { return new CompositeQAProvider(); }
}
