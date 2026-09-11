"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewRecord } from "@/features/medical-records/review-data";

const labels: Record<string, string> = { lab: "Lab Results", medication: "Medications", diagnosis: "Diagnoses", allergy: "Allergies", vital: "Vitals", procedure: "Procedures", doctor_note: "Doctor Notes" };
const editable: Record<string, string[]> = {
  lab: ["test_name", "original_value", "numeric_value", "unit", "reference_range", "flag"],
  medication: ["name", "dose", "dose_unit", "route", "frequency", "duration"],
  diagnosis: ["name", "code", "status"], allergy: ["allergen", "reaction", "severity", "status"],
  vital: ["measurement_type", "label", "original_value", "numeric_value", "secondary_value", "unit"],
  procedure: ["procedure_name", "performed_at", "notes"], doctor_note: ["text"],
};
const numericFields = new Set(["numeric_value", "secondary_value"]);

export function ReviewWorkspace({ documentId, pages, blocks, records }: {
  documentId: string; pages: { id: string; page_number: number; native_text_used: boolean }[];
  blocks: { id: string; page_id: string; block_index: number; text: string; source_type: string }[];
  records: ReviewRecord[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(records[0]?.id ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const selectedRecord = records.find((record) => record.id === selected);
  const grouped = useMemo(() => Object.entries(labels).map(([kind, label]) => [kind, label, records.filter((record) => record.recordType === kind)] as const).filter(([, , group]) => group.length), [records]);

  async function submit(record: ReviewRecord, action: "approve" | "reject" | "correct", form?: HTMLFormElement) {
    setMessage("Saving…");
    let body: Record<string, unknown> = { action, recordId: record.id };
    if (action === "correct" && form) {
      const values = new FormData(form);
      const correction: Record<string, unknown> = { recordType: record.recordType };
      for (const field of editable[record.recordType]) {
        const raw = String(values.get(field) ?? "").trim();
        correction[field] = numericFields.has(field) ? (raw === "" ? null : Number(raw)) : (raw || null);
      }
      body = { ...body, correction };
    }
    const response = await fetch(`/api/records/${documentId}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setMessage(result.error ?? "The change could not be saved."); return; }
    setMessage("Saved."); setEditing(null); router.refresh();
  }

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Source text</h2>
      <p className="mt-1 text-sm text-slate-500">Select “Show source” to locate the exact page and text block. Visual PDF highlighting is not available yet.</p>
      {pages.map((page) => <div className="mt-5" key={page.id}>
        <h3 className="font-semibold">Page {page.page_number} · {page.native_text_used ? "Native text" : "OCR"}</h3>
        <div className="mt-2 space-y-2">{blocks.filter((block) => block.page_id === page.id).map((block) => {
          const active = selectedRecord?.sourceBlockIds.includes(block.id);
          return <p className={`rounded-lg border p-3 text-sm whitespace-pre-wrap ${active ? "border-teal-500 bg-teal-50" : "border-slate-200"}`} key={block.id}>{block.text}</p>;
        })}</div>
      </div>)}
    </section>
    <section className="space-y-6">
      <div><h2 className="text-lg font-semibold">Extracted data</h2><p aria-live="polite" className="mt-1 text-sm text-teal-700">{message}</p></div>
      {grouped.map(([kind, label, group]) => <div key={kind}><h3 className="mb-2 font-semibold">{label}</h3><div className="space-y-3">
        {group.map((record) => <article className="rounded-xl border border-slate-200 bg-white p-4" key={record.id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize">{record.reviewStatus}</span><span className="text-xs text-slate-500">{record.confidence >= .8 ? "High" : record.confidence >= .5 ? "Medium" : "Low"} confidence</span></div>
          {editing === record.id ? <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void submit(record, "correct", event.currentTarget); }}>
            {editable[record.recordType].map((field) => <label className="text-sm capitalize" key={field}>{field.replaceAll("_", " ")}<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={record.values[field] ?? ""} name={field} type={numericFields.has(field) ? "number" : field === "performed_at" ? "date" : "text"} step="any" /></label>)}
            <div className="flex gap-2 sm:col-span-2"><button className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Save correction</button><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setEditing(null)} type="button">Cancel</button></div>
          </form> : <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{Object.entries(record.values).filter(([, value]) => value !== null && value !== "").map(([key, value]) => <div key={key}><dt className="text-slate-500 capitalize">{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl>}
          <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => void submit(record, "approve")}>Approve</button><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setEditing(record.id)}>Edit / Correct</button><button className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700" onClick={() => void submit(record, "reject")}>Reject</button><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setSelected(record.id)}>Show source</button></div>
          {selected === record.id ? <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>Page {record.sourcePageNumber}</strong><p className="mt-1 whitespace-pre-wrap">{record.sourceText}</p><p className="mt-2 text-xs text-slate-500">Source blocks: {record.sourceBlockIds.join(", ")}</p></div> : null}
        </article>)}
      </div></div>)}
    </section>
  </div>;
}
