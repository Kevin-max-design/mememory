"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TimelineCategory, TimelineEvent } from "@/features/timeline/builder";

const filters: ["all" | TimelineCategory, string][] = [["all", "All"], ["labs", "Labs"], ["medications", "Medications"], ["diagnoses", "Diagnoses"], ["allergies", "Allergies"], ["vitals", "Vitals"], ["procedures", "Procedures"], ["documents", "Documents"]];

export function TimelineView({ events }: { events: TimelineEvent[] }) {
  const [filter, setFilter] = useState<"all" | TimelineCategory>("all");
  const [search, setSearch] = useState("");
  const shown = useMemo(() => events.filter((event) => (filter === "all" || event.category === filter) && `${event.title} ${event.description}`.toLowerCase().includes(search.trim().toLowerCase())), [events, filter, search]);
  return <><div className="mt-8 rounded-xl border border-slate-200 bg-white p-4"><label className="text-sm font-semibold">Search timeline<input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" onChange={(event) => setSearch(event.target.value)} placeholder="Search titles and descriptions" value={search} /></label><div className="mt-4 flex flex-wrap gap-2">{filters.map(([value, label]) => <button className={`rounded-full px-3 py-2 text-sm ${filter === value ? "bg-teal-700 text-white" : "bg-slate-100"}`} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    {shown.length ? <ol className="mt-8 space-y-4">{shown.map((event) => <li className="relative rounded-xl border border-slate-200 bg-white p-5" key={event.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold capitalize text-teal-800">{event.category}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize">{event.reviewStatus.replace("_", " ")}</span></div><h2 className="mt-3 text-lg font-semibold">{event.title}</h2><p className="mt-1 text-sm text-slate-600">{event.description}</p></div><div className="text-right"><time className="font-semibold">{new Date(event.date).toLocaleDateString()}</time><p className="text-xs text-slate-500">{event.dateLabel}</p></div></div><div className="mt-4 flex gap-4 text-sm"><Link className="font-semibold text-teal-700" href={event.sourceHref}>Open record</Link>{event.reviewHref ? <Link className="font-semibold text-teal-700" href={event.reviewHref}>View source</Link> : null}</div></li>)}</ol> : <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">No timeline events match this view.</div>}</>;
}
