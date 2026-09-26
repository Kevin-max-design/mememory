"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { UiIcon } from "@/components/ui-icons";
import type { TimelineCategory, TimelineEvent } from "@/features/timeline/builder";

const filters: ["all" | TimelineCategory, string][] = [
  ["all", "All"], ["labs", "Labs"], ["medications", "Medications"],
  ["diagnoses", "Diagnoses"], ["allergies", "Allergies"], ["vitals", "Vitals"],
  ["procedures", "Procedures"], ["documents", "Documents"],
];

export function TimelineView({ events }: { events: TimelineEvent[] }) {
  const [filter, setFilter] = useState<"all" | TimelineCategory>("all");
  const [search, setSearch] = useState("");
  const shown = useMemo(
    () => events.filter((event) => (filter === "all" || event.category === filter) && `${event.title} ${event.description}`.toLowerCase().includes(search.trim().toLowerCase())),
    [events, filter, search],
  );

  return (
    <>
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <label className="relative block">
          <UiIcon className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" name="search" />
          <span className="sr-only">Search timeline</span>
          <input className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-50" onChange={(event) => setSearch(event.target.value)} placeholder="Search your reviewed history" value={search} />
        </label>
        <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map(([value, label]) => (
            <button className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition ${filter === value ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
          ))}
        </div>
      </section>

      {shown.length ? (
        <ol className="relative mt-6 space-y-3 before:absolute before:bottom-8 before:left-[19px] before:top-8 before:w-px before:bg-slate-200">
          {shown.map((event) => (
            <li className="relative rounded-2xl border border-slate-200/80 bg-white p-5 pl-14 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" key={event.id}>
              <span className="absolute left-[13px] top-7 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-teal-600 ring-1 ring-teal-200" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-teal-800">{event.category}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium capitalize text-slate-500">{event.reviewStatus.replace("_", " ")}</span>
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-900">{event.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{event.description}</p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <time className="text-sm font-semibold text-slate-700">{new Date(event.date).toLocaleDateString()}</time>
                  <p className="text-xs text-slate-400">{event.dateLabel}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <Link className="font-semibold text-teal-700 hover:text-teal-900" href={event.sourceHref}>Open record</Link>
                {event.reviewHref ? <Link className="font-semibold text-teal-700 hover:text-teal-900" href={event.reviewHref}>View source</Link> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-500">No timeline events match this view.</div>
      )}
    </>
  );
}
