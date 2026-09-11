import Link from "next/link";
import { requireUser } from "@/server/auth/require-user";

export default async function RecordsPage() {
  const { supabase, user } = await requireUser();
  const [{ data: documents, error }, { data: records }] = await Promise.all([
    supabase.from("documents").select("id,display_name,document_type,event_date,processing_status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("medical_records").select("document_id,review_status").eq("user_id", user.id),
  ]);
  if (error) throw new Error("RECORD_LIST_FAILED");
  return <main className="mx-auto max-w-5xl px-6 py-12"><header className="flex items-center justify-between"><div><p className="text-sm font-semibold tracking-widest text-teal-700">MEDMEMORY</p><h1 className="mt-2 text-3xl font-semibold">Medical records</h1></div><Link className="rounded-lg border px-4 py-2" href="/dashboard">Dashboard</Link></header>
    <div className="mt-8 space-y-3">{documents?.map((document) => { const candidates = records?.filter((record) => record.document_id === document.id) ?? []; const reviewed = candidates.filter((record) => record.review_status !== "extracted").length; return <article className="rounded-xl border border-slate-200 bg-white p-5" key={document.id}><div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold">{document.display_name}</h2><p className="mt-1 text-sm text-slate-500">{document.document_type ?? "Medical document"} · {document.event_date ?? "Date not provided"} · Uploaded {new Date(document.created_at).toLocaleDateString()}</p><p className="mt-2 text-sm">{candidates.length} candidates · {reviewed}/{candidates.length} reviewed</p></div><div className="flex items-center gap-2"><span className="capitalize text-sm">{document.processing_status.replace("_", " ")}</span><Link className="rounded-lg border px-3 py-2 text-sm" href={`/records/${document.id}`}>View</Link>{document.processing_status === "needs_review" ? <Link className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white" href={`/records/${document.id}/review`}>Review</Link> : null}</div></div></article>; })}</div>
  </main>;
}
