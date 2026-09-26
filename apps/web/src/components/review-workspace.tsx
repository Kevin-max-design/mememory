"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReviewRecord } from "@/features/medical-records/review-data";
import { normalizeMedicalMeasurement } from "@/features/extraction/normalization";

const labels: Record<string, string> = {
  lab: "Lab Results",
  medication: "Medications",
  diagnosis: "Diagnoses",
  allergy: "Allergies",
  vital: "Vitals",
  procedure: "Procedures",
  doctor_note: "Doctor Notes",
};
const editable: Record<string, string[]> = {
  lab: [
    "test_name",
    "original_value",
    "numeric_value",
    "unit",
    "reference_range",
    "flag",
  ],
  medication: ["name", "dose", "dose_unit", "route", "frequency", "duration"],
  diagnosis: ["name", "code", "status"],
  allergy: ["allergen", "reaction", "severity", "status"],
  vital: [
    "measurement_type",
    "label",
    "original_value",
    "numeric_value",
    "secondary_value",
    "unit",
  ],
  procedure: ["procedure_name", "performed_at", "notes"],
  doctor_note: ["text"],
};
const numericFields = new Set(["numeric_value", "secondary_value"]);

type ReviewBlock = {
  id: string;
  page_id: string;
  block_index: number;
  text: string;
  source_type: string;
  confidence: number | null;
  bbox: unknown;
};

function blockRegion(block: ReviewBlock, pageHeight: number) {
  const box = block.bbox as { y0?: unknown; y1?: unknown } | null;
  const y0 = typeof box?.y0 === "number" ? box.y0 : null;
  const y1 = typeof box?.y1 === "number" ? box.y1 : null;
  if (
    /verified by|approved by|results? (?:relate|apply) only|disclaimer/i.test(
      block.text,
    )
  )
    return "Disclaimer";
  if (y1 !== null && y1 <= pageHeight * 0.08) return "Likely header";
  if (y0 !== null && y0 >= pageHeight * 0.92) return "Likely footer";
  return "Main content";
}

export function ReviewWorkspace({
  documentId,
  pages,
  blocks,
  records,
  previewUrl,
  mimeType,
}: {
  documentId: string;
  pages: {
    id: string;
    page_number: number;
    native_text_used: boolean;
    width: number;
    height: number;
  }[];
  blocks: ReviewBlock[];
  records: ReviewRecord[];
  previewUrl: string | null;
  mimeType: string;
}) {
  const firstPending = records.find(
    (record) => record.reviewStatus === "extracted",
  );
  const [items, setItems] = useState(records);
  const [selected, setSelected] = useState(
    firstPending?.id ?? records[0]?.id ?? "",
  );
  const [selectedPage, setSelectedPage] = useState(
    firstPending?.sourcePageNumber ??
      records[0]?.sourcePageNumber ??
      pages[0]?.page_number ??
      1,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const initialPending = records.some(
    (record) => record.reviewStatus === "extracted",
  );
  const [view, setView] = useState<"pending" | "reviewed">(
    initialPending ? "pending" : "reviewed",
  );
  const pending = items.filter((record) => record.reviewStatus === "extracted");
  const reviewed = items.filter(
    (record) => record.reviewStatus !== "extracted",
  );
  const trusted = items.filter(
    (record) =>
      record.reviewStatus === "approved" || record.reviewStatus === "corrected",
  );
  const selectedRecord = items.find((record) => record.id === selected);
  const sourcePage =
    pages.find((page) => page.page_number === selectedPage) ?? pages[0];
  const sourceBlocks = sourcePage
    ? blocks.filter((block) => block.page_id === sourcePage.id)
    : [];
  const visibleRecords = view === "pending" ? pending : reviewed;
  const grouped = useMemo(
    () =>
      Object.entries(labels)
        .map(
          ([kind, label]) =>
            [
              kind,
              label,
              visibleRecords.filter((record) => record.recordType === kind),
            ] as const,
        )
        .filter(([, , group]) => group.length),
    [visibleRecords],
  );
  const lowConfidencePages = useMemo(
    () =>
      pages
        .filter((page) => {
          const values = blocks
            .filter(
              (block) => block.page_id === page.id && block.confidence !== null,
            )
            .map((block) => block.confidence as number);
          return (
            values.length > 0 &&
            values.reduce((sum, value) => sum + value, 0) / values.length < 0.5
          );
        })
        .map((page) => page.page_number),
    [blocks, pages],
  );

  async function submit(
    record: ReviewRecord,
    action: "approve" | "reject" | "correct",
    form?: HTMLFormElement,
  ) {
    if (busy) return;
    setBusy(record.id);
    setMessage("Saving…");
    let body: Record<string, unknown> = { action, recordId: record.id };
    let correctedValues: Record<string, string | number | null> | null = null;
    if (action === "correct" && form) {
      const values = new FormData(form);
      const correction: Record<string, unknown> = {
        recordType: record.recordType,
      };
      for (const field of editable[record.recordType]) {
        const raw = String(values.get(field) ?? "").trim();
        correction[field] = numericFields.has(field)
          ? raw === ""
            ? null
            : Number(raw)
          : raw || null;
      }
      body = { ...body, correction };
      correctedValues = Object.fromEntries(
        Object.entries(correction).filter(([key]) => key !== "recordType"),
      ) as Record<string, string | number | null>;
    }
    try {
      const response = await fetch(`/api/records/${documentId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        error?: string;
        documentStatus?: string;
      };
      if (!response.ok) {
        setMessage(result.error ?? "The change could not be saved.");
        return;
      }
      const reviewStatus =
        action === "approve"
          ? "approved"
          : action === "correct"
            ? "corrected"
            : "rejected";
      const nextItems = items.map((item) =>
        item.id === record.id
          ? { ...item, reviewStatus, values: correctedValues ?? item.values }
          : item,
      );
      const nextPending = nextItems.find(
        (item) => item.reviewStatus === "extracted",
      );
      setItems(nextItems);
      setSelected(nextPending?.id ?? record.id);
      setSelectedPage(nextPending?.sourcePageNumber ?? record.sourcePageNumber);
      setMessage(
        action === "approve"
          ? "Approved. This fact is now available in your timeline, search, and Ask MedMemory."
          : action === "correct"
            ? "Correction saved. This fact is now trusted."
            : "Rejected. This fact will not appear in trusted history.",
      );
      setEditing(null);
      if (!nextPending && result.documentStatus === "completed")
        setView("pending");
    } catch {
      setMessage(
        "The change could not be saved. Check your connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="order-2 rounded-2xl border border-slate-200 bg-white p-5 lg:order-1 lg:sticky lg:top-6">
        <h2 className="text-lg font-semibold">
          Original document and source text
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          The preview uses a five-minute signed link to this private document.
          Select “Show source” to jump to its page.
        </p>
        {previewUrl ? (
          <iframe
            className="mt-4 h-[420px] w-full rounded-lg border bg-slate-50 lg:h-[560px]"
            src={`${previewUrl}${mimeType === "application/pdf" ? `#page=${selectedPage}` : ""}`}
            title="Private original document preview"
          />
        ) : (
          <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
            The private preview is temporarily unavailable. Reload to request a
            new signed link.
          </div>
        )}
        {lowConfidencePages.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Low-confidence OCR on page
            {lowConfidencePages.length === 1 ? "" : "s"}{" "}
            {lowConfidencePages.join(", ")}. Verify candidates against the
            original document before approval.
          </div>
        ) : null}
        {sourcePage ? (
          <div className="mt-5">
            <label className="text-sm font-semibold">
              Source page
              <select
                className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 font-normal"
                onChange={(event) =>
                  setSelectedPage(Number(event.target.value))
                }
                value={selectedPage}
              >
                {pages.map((page) => (
                  <option key={page.id} value={page.page_number}>
                    Page {page.page_number}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-slate-500">
              {sourcePage.native_text_used ? "Native text" : "OCR"} ·{" "}
              {sourceBlocks.length} text blocks ·{" "}
              {items.filter(
                (record) => record.sourcePageNumber === sourcePage.page_number,
              ).length || "No"}{" "}
              candidates
            </p>
            <details className="mt-3 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-teal-800">
                Show extracted source text for page {sourcePage.page_number}
              </summary>
              <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                {sourceBlocks.map((block) => {
                  const active = selectedRecord?.sourceBlockIds.includes(
                    block.id,
                  );
                  const region = blockRegion(block, sourcePage.height);
                  return (
                    <div
                      className={`rounded-lg border p-3 text-sm ${active ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}
                      key={block.id}
                    >
                      <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>
                          {block.source_type === "native_pdf"
                            ? "Native text"
                            : "OCR"}
                        </span>
                        <span>{region}</span>
                        {block.confidence !== null ? (
                          <span>
                            {Math.round(block.confidence * 100)}% confidence
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap">{block.text}</p>
                      {normalizeMedicalMeasurement(block.text) !==
                      block.text ? (
                        <p className="mt-2 border-t pt-2 text-xs text-slate-500">
                          Normalized for extraction:{" "}
                          {normalizeMedicalMeasurement(block.text)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        ) : null}
      </section>
      <section className="order-1 space-y-6 lg:order-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Review progress</h2>
              <p className="mt-1 text-sm text-slate-500">
                {reviewed.length} of {items.length} decisions saved ·{" "}
                {trusted.length} trusted
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${pending.length ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-800"}`}
            >
              {pending.length
                ? `${pending.length} remaining`
                : "Review complete"}
            </span>
          </div>
          <div
            aria-label={`${reviewed.length} of ${items.length} facts reviewed`}
            className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemax={items.length}
            aria-valuemin={0}
            aria-valuenow={reviewed.length}
          >
            <div
              className="h-full rounded-full bg-teal-600 transition-all"
              style={{
                width: `${items.length ? (reviewed.length / items.length) * 100 : 100}%`,
              }}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === "pending" ? "bg-teal-700 text-white" : "bg-slate-100"}`}
              onClick={() => setView("pending")}
              type="button"
            >
              Needs review ({pending.length})
            </button>
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === "reviewed" ? "bg-teal-700 text-white" : "bg-slate-100"}`}
              onClick={() => setView("reviewed")}
              type="button"
            >
              Reviewed ({reviewed.length})
            </button>
          </div>
          {message ? (
            <p
              aria-live="polite"
              className="mt-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-900"
            >
              {message}
            </p>
          ) : null}
        </div>
        {!pending.length && view === "pending" ? (
          <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">
              Review complete
            </p>
            <h2 className="mt-2 text-xl font-semibold text-teal-950">
              Your trusted facts are ready
            </h2>
            <p className="mt-2 text-sm text-teal-900">
              Approved and corrected facts now appear in your medical timeline,
              search, and Ask MedMemory. Rejected facts stay excluded.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
                href="/timeline"
              >
                Open timeline
              </Link>
              <Link
                className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800"
                href="/search"
              >
                Search records
              </Link>
              <Link
                className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800"
                href="/dashboard"
              >
                Back to dashboard
              </Link>
              <button
                className="rounded-lg px-4 py-2 text-sm font-semibold text-teal-800"
                onClick={() => setView("reviewed")}
                type="button"
              >
                View decisions
              </button>
            </div>
          </section>
        ) : null}
        {grouped.map(([kind, label, group]) => (
          <div key={kind}>
            <h3 className="mb-2 font-semibold">{label}</h3>
            <div className="space-y-3">
              {group.map((record) => (
                <article
                  className="rounded-xl border border-slate-200 bg-white p-4"
                  id={`record-${record.id}`}
                  key={record.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${record.reviewStatus === "approved" || record.reviewStatus === "corrected" ? "bg-teal-50 text-teal-800" : record.reviewStatus === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}
                    >
                      {record.reviewStatus === "extracted"
                        ? "Needs review"
                        : record.reviewStatus}
                    </span>
                    <span className="text-xs text-slate-500">
                      {record.confidence >= 0.8
                        ? "High"
                        : record.confidence >= 0.5
                          ? "Medium"
                          : "Low"}{" "}
                      confidence
                    </span>
                  </div>
                  {editing === record.id ? (
                    <form
                      className="mt-3 grid gap-3 sm:grid-cols-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submit(record, "correct", event.currentTarget);
                      }}
                    >
                      {editable[record.recordType].map((field) => (
                        <label className="text-sm capitalize" key={field}>
                          {field.replaceAll("_", " ")}
                          <input
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                            defaultValue={record.values[field] ?? ""}
                            name={field}
                            type={
                              numericFields.has(field)
                                ? "number"
                                : field === "performed_at"
                                  ? "date"
                                  : "text"
                            }
                            step="any"
                          />
                        </label>
                      ))}
                      <div className="flex gap-2 sm:col-span-2">
                        <button
                          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
                          disabled={busy === record.id}
                        >
                          {busy === record.id ? "Saving…" : "Save correction"}
                        </button>
                        <button
                          className="rounded-lg border px-3 py-2 text-sm"
                          onClick={() => setEditing(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      {Object.entries(record.values)
                        .filter(([, value]) => value !== null && value !== "")
                        .map(([key, value]) => (
                          <div key={key}>
                            <dt className="text-slate-500 capitalize">
                              {key.replaceAll("_", " ")}
                            </dt>
                            <dd>{String(value)}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {record.reviewStatus === "extracted" ? (
                      <>
                        <button
                          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          disabled={busy === record.id}
                          onClick={() => void submit(record, "approve")}
                        >
                          {busy === record.id ? "Saving…" : "Approve"}
                        </button>
                        <button
                          className="rounded-lg border px-3 py-2 text-sm"
                          disabled={busy === record.id}
                          onClick={() => setEditing(record.id)}
                        >
                          Edit / Correct
                        </button>
                        <button
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                          disabled={busy === record.id}
                          onClick={() => void submit(record, "reject")}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="rounded-lg border px-3 py-2 text-sm"
                          onClick={() => setEditing(record.id)}
                        >
                          Edit decision
                        </button>
                        {record.reviewStatus === "rejected" ? (
                          <button
                            className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-700"
                            disabled={busy === record.id}
                            onClick={() => void submit(record, "approve")}
                          >
                            Approve instead
                          </button>
                        ) : (
                          <button
                            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
                            disabled={busy === record.id}
                            onClick={() => void submit(record, "reject")}
                          >
                            Reject instead
                          </button>
                        )}
                      </>
                    )}
                    <button
                      className="rounded-lg border px-3 py-2 text-sm"
                      onClick={() => {
                        setSelected(record.id);
                        setSelectedPage(record.sourcePageNumber);
                      }}
                    >
                      Show source
                    </button>
                  </div>
                  {selected === record.id ? (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                      <strong>Page {record.sourcePageNumber}</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {record.sourceText}
                      </p>
                      {normalizeMedicalMeasurement(record.sourceText) !==
                      record.sourceText ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Normalized for parsing:{" "}
                          {normalizeMedicalMeasurement(record.sourceText)}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-slate-500">
                        Source blocks: {record.sourceBlockIds.join(", ")}
                      </p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
