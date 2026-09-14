import Link from "next/link";
import { getReviewData } from "@/features/medical-records/review-data";
import { DeleteDocumentButton } from "@/components/privacy-controls";

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const data = await getReviewData(id);
  return <main className="mx-auto max-w-5xl px-6 py-12"><Link className="text-sm text-teal-700" href="/records">← Records</Link><div className="mt-5 flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-semibold">{data.document.display_name}</h1><p className="mt-2 text-slate-500">{data.document.mime_type} · {(data.document.file_size / 1024).toFixed(1)} KB · {new Date(data.document.created_at).toLocaleDateString()}</p></div>{data.document.processing_status === "needs_review" ? <Link className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white" href={`/records/${id}/review`}>Review extracted data</Link> : null}</div>
    <section className="mt-8 grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Overview</h2><p className="mt-2 capitalize">{data.document.processing_status.replace("_", " ")}</p></div><div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Extracted data</h2><p className="mt-2">{data.records.length} candidates</p></div><div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Activity</h2><p className="mt-2 text-sm text-slate-500">Uploaded {new Date(data.document.created_at).toLocaleString()}</p></div></section>
    <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="font-semibold">Text</h2><div className="mt-3 space-y-3">{data.pages.map((page) => <div key={page.id}><h3 className="text-sm font-semibold">Page {page.page_number}</h3>{data.blocks.filter((block) => block.page_id === page.id).map((block) => <p className="mt-1 whitespace-pre-wrap text-sm" key={block.id}>{block.text}</p>)}</div>)}</div></section>
    <section className="mt-6 rounded-xl border border-red-200 bg-white p-5"><h2 className="font-semibold text-red-800">Delete document</h2><p className="my-3 text-sm text-slate-600">Permanently remove this file and all processing and extracted data derived from it.</p><DeleteDocumentButton documentId={id} /></section>
  </main>;
}
