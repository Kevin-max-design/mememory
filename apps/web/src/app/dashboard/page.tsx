import { logout } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/errors";
import { DocumentUpload } from "@/components/document-upload";
import { requireUser } from "@/server/auth/require-user";
import Link from "next/link";
import { getTimelineEventsForUser } from "@/features/timeline/data";
import { AccountPrivacyControls } from "@/components/privacy-controls";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; welcome?: string }>;
}) {
  const query = await searchParams;
  const notice = authErrorMessage(query.error);
  const { supabase, user } = await requireUser();
  const [profileResult, documentsResult, timelineEvents] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select(
        "id, display_name, mime_type, file_size, processing_status, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    getTimelineEventsForUser(supabase, user.id),
  ]);
  const { data: profile, error } = profileResult;
  if (error) throw new Error("PROFILE_READ_FAILED");
  const { data: documents, error: documentsError } = documentsResult;
  if (documentsError) throw new Error("DOCUMENT_LIST_FAILED");

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold tracking-widest text-teal-700">
            MEDMEMORY
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {profile?.full_name
              ? `Welcome, ${profile.full_name}`
              : "Your health archive"}
          </h1>
        </div>
        <form action={logout}>
          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>
      {notice ? (
        <p
          className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {notice}
        </p>
      ) : null}
      {query.welcome === "1" ? (
        <section
          className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6"
          aria-labelledby="welcome-heading"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Start here
          </p>
          <h2
            className="mt-2 text-xl font-semibold text-teal-950"
            id="welcome-heading"
          >
            Your private archive is ready
          </h2>
          <ol className="mt-4 grid gap-3 text-sm text-teal-950 sm:grid-cols-3">
            <li>
              <strong className="block">1. Upload one record</strong>
              <span className="text-teal-800">PDF or supported image.</span>
            </li>
            <li>
              <strong className="block">2. Wait for processing</strong>
              <span className="text-teal-800">Status appears below.</span>
            </li>
            <li>
              <strong className="block">3. Review the result</strong>
              <span className="text-teal-800">
                Approve or correct before trust.
              </span>
            </li>
          </ol>
        </section>
      ) : null}
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold">Upload a medical record</h2>
        <p className="mt-2 text-slate-600">
          Add a scan, photo, or PDF to your private archive.
        </p>
        <DocumentUpload />
      </section>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Medical timeline</h2>
            <p className="mt-1 text-sm text-slate-500">
              Your reviewed history in chronological order.
            </p>
          </div>
          <Link
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
            href="/timeline"
          >
            Open timeline
          </Link>
        </div>
        {timelineEvents.length ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {timelineEvents.slice(0, 3).map((event) => (
              <li className="flex justify-between gap-4 py-3" key={event.id}>
                <span>{event.title}</span>
                <span className="text-sm text-slate-500">
                  {new Date(event.date).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Reviewed records will appear here.
          </p>
        )}
      </section>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Search records</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search documents, source text, and reviewed facts.
            </p>
          </div>
          <Link
            className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700"
            href="/search"
          >
            Search
          </Link>
        </div>
      </section>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Ask MedMemory</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ask questions answered only from your reviewed records.
            </p>
          </div>
          <Link
            className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700"
            href="/ask"
          >
            Ask
          </Link>
        </div>
      </section>
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your documents</h2>
          <Link className="text-sm font-semibold text-teal-700" href="/records">
            View all records
          </Link>
        </div>
        {documents?.length ? (
          <ul className="mt-4 space-y-3">
            {documents.map((document) => (
              <li
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
                key={document.id}
              >
                <div>
                  <p className="font-semibold">{document.display_name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {(document.file_size / 1024).toFixed(1)} KB ·{" "}
                    {document.mime_type}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium capitalize text-amber-800">
                    {document.processing_status.replace("_", " ")}
                  </span>
                  {document.processing_status === "needs_review" ? (
                    <Link
                      className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
                      href={`/records/${document.id}/review`}
                    >
                      Review
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-slate-600">
            No documents yet. Your first upload will appear here.
          </p>
        )}
      </section>
      <AccountPrivacyControls />
      <p className="mt-8 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-500">
        AI-assisted results may be incomplete or wrong. Verify important details
        against the original document. MedMemory does not provide medical advice
        or emergency services.
      </p>
    </main>
  );
}
