import Link from "next/link";
import { TimelineView } from "@/components/timeline-view";
import { getTimelineEvents } from "@/features/timeline/data";

export default async function TimelinePage() {
  const events = await getTimelineEvents();
  return <main className="mx-auto max-w-4xl px-6 py-12"><header className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold tracking-widest text-teal-700">MEDMEMORY</p><h1 className="mt-2 text-3xl font-semibold">Medical timeline</h1><p className="mt-2 text-slate-600">Reviewed facts and documents, ordered newest first.</p></div><Link className="rounded-lg border px-4 py-2" href="/dashboard">Dashboard</Link></header><TimelineView events={events} /></main>;
}
