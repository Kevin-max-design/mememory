"use client";

import Link from "next/link";
import { useState } from "react";

const reasons = [
  "Sudden illness",
  "Pain",
  "Breathing problem",
  "Accident or injury",
  "Existing condition getting worse",
  "Other",
] as const;

export function MedicalHelpOrganizer() {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [prepared, setPrepared] = useState(false);

  return (
    <div className="mx-auto mt-8 max-w-3xl">
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
        <h2 className="font-bold">Emergency safety alert</h2>
        <p className="mt-2 text-sm leading-6">
          If this may be life-threatening, contact your local emergency service
          immediately. Do not wait for MedMemory or use this form for urgent
          triage.
        </p>
        <Link
          className="mt-3 inline-block text-sm font-bold underline"
          href="/emergency"
        >
          Open my emergency summary
        </Link>
      </section>

      <div className="mt-7 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-teal-600 transition-all"
          style={{ width: prepared ? "100%" : reason ? "66%" : "33%" }}
        />
      </div>

      <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {!prepared ? (
          <>
            <h2 className="text-xl font-bold">What is happening?</h2>
            <p className="mt-2 text-sm text-slate-500">
              This only organizes your description and reviewed history for a
              clinician. It does not diagnose or recommend treatment.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {reasons.map((item) => (
                <button
                  aria-pressed={reason === item}
                  className={`rounded-xl border px-4 py-4 text-left text-sm font-semibold transition ${reason === item ? "border-teal-500 bg-teal-50 text-teal-900" : "border-slate-200 hover:border-teal-300"}`}
                  key={item}
                  onClick={() => setReason(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            {reason ? (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <label className="text-sm font-bold" htmlFor="help-details">
                  What would you like the clinician to know?
                </label>
                <textarea
                  className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 p-4 text-sm"
                  id="help-details"
                  maxLength={1000}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Describe when it started and what changed. Do not wait here if it is urgent."
                  value={details}
                />
                <button
                  className="mt-4 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  disabled={!details.trim()}
                  onClick={() => setPrepared(true)}
                  type="button"
                >
                  Prepare clinician handoff
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
              Handoff outline
            </p>
            <h2 className="mt-2 text-2xl font-bold">{reason}</h2>
            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6">
              {details}
            </p>
            <p className="mt-4 text-sm text-slate-600">
              Add your reviewed history from the doctor brief. Verify every
              detail with the clinician and original records.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white"
                href="/doctor-brief"
              >
                Open doctor brief
              </Link>
              <button
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold"
                onClick={() => setPrepared(false)}
                type="button"
              >
                Edit description
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
