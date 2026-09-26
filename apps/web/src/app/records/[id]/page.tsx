import Link from "next/link";
import { getDocumentOverview } from "@/features/medical-records/review-data";
import { DeleteDocumentButton } from "@/components/privacy-controls";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getDocumentOverview(id);
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link className="text-sm text-teal-700" href="/records">
        ← Records
      </Link>
      <div className="mt-5 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {data.document.display_name}
          </h1>
          <p className="mt-2 text-slate-500">
            {data.document.mime_type} ·{" "}
            {(data.document.file_size / 1024).toFixed(1)} KB ·{" "}
            {new Date(data.document.created_at).toLocaleDateString()}
          </p>
        </div>
        {data.document.processing_status === "needs_review" ? (
          <Link
            className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white"
            href={`/records/${id}/review`}
          >
            Review extracted data
          </Link>
        ) : null}
      </div>
      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Status</h2>
          <p className="mt-2 capitalize">
            {data.document.processing_status.replace("_", " ")}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Pages</h2>
          <p className="mt-2 text-2xl font-semibold">{data.pageCount}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Trusted facts</h2>
          <p className="mt-2 text-2xl font-semibold text-teal-700">
            {data.approvedCount}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Needs review</h2>
          <p className="mt-2 text-2xl font-semibold text-amber-700">
            {data.pendingCount}
          </p>
        </div>
      </section>
      <section className="mt-6 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Extracted facts</h2>
            <p className="mt-2 text-sm text-slate-600">
              {data.candidateCount} candidates · {data.approvedCount} approved
              or corrected · {data.rejectedCount} rejected
            </p>
          </div>
          <Link
            className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700"
            href={`/records/${id}/review`}
          >
            {data.pendingCount ? "Continue review" : "View reviewed facts"}
          </Link>
        </div>
      </section>
      <section className="mt-6 rounded-xl border border-red-200 bg-white p-5">
        <h2 className="font-semibold text-red-800">Delete document</h2>
        <p className="my-3 text-sm text-slate-600">
          Permanently remove this file and all processing and extracted data
          derived from it.
        </p>
        <DeleteDocumentButton documentId={id} />
      </section>
    </main>
  );
}
