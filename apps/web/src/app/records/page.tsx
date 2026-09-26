import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getTimelineEventsForUser } from "@/features/timeline/data";
import { requireUser } from "@/server/auth/require-user";

const categoryLabels = {
  labs: "Lab results",
  medications: "Medications",
  diagnoses: "Diagnoses",
  allergies: "Allergies",
  vitals: "Vitals",
  procedures: "Procedures",
  notes: "Clinical notes",
} as const;

export default async function RecordsPage() {
  const { supabase, user } = await requireUser();
  const [{ data: documents, error }, { data: records }, timelineEvents] =
    await Promise.all([
      supabase
        .from("documents")
        .select(
          "id,display_name,document_type,event_date,processing_status,created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("medical_records")
        .select("document_id,review_status")
        .eq("user_id", user.id),
      getTimelineEventsForUser(supabase, user.id),
    ]);
  if (error) throw new Error("RECORD_LIST_FAILED");
  const facts = timelineEvents.filter(
    (event) => event.category !== "documents",
  );
  const reviewByDocument = new Map<
    string,
    { total: number; reviewed: number }
  >();
  for (const record of records ?? []) {
    const counts = reviewByDocument.get(record.document_id) ?? {
      total: 0,
      reviewed: 0,
    };
    counts.total += 1;
    if (record.review_status !== "extracted") counts.reviewed += 1;
    reviewByDocument.set(record.document_id, counts);
  }
  const attention = (documents ?? []).filter((document) => {
    const counts = reviewByDocument.get(document.id);
    return (
      document.processing_status === "needs_review" &&
      Boolean(counts && counts.total > counts.reviewed)
    );
  });
  const categoryCounts = Object.fromEntries(
    Object.keys(categoryLabels).map((category) => [
      category,
      facts.filter((event) => event.category === category).length,
    ]),
  ) as Record<keyof typeof categoryLabels, number>;

  return (
    <AppShell
      active="history"
      description="A clear view of facts you approved or corrected, with every item linked back to its source."
      title="Your medical history"
    >
      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-teal-800 p-5 text-white">
          <p className="text-sm text-teal-100">Trusted facts</p>
          <p className="mt-2 text-3xl font-semibold">{facts.length}</p>
          <p className="mt-2 text-xs text-teal-100">
            Approved or corrected by you
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Documents</p>
          <p className="mt-2 text-3xl font-semibold">
            {documents?.length ?? 0}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Private files in your archive
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-800">Needs attention</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">
            {attention.length}
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Documents with facts to review
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Last update</p>
          <p className="mt-2 text-lg font-semibold">
            {facts[0]
              ? new Date(facts[0].date).toLocaleDateString()
              : "No history yet"}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Based on reviewed history
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">History at a glance</h2>
            <p className="mt-1 text-sm text-slate-500">
              Only trusted facts are counted here.
            </p>
          </div>
          <Link
            className="text-sm font-semibold text-teal-700"
            href="/timeline"
          >
            Open full timeline →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(categoryLabels).map(([category, label]) => (
            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-sm"
              href="/timeline"
              key={category}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  {label}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold group-hover:bg-teal-50 group-hover:text-teal-800">
                  {categoryCounts[category as keyof typeof categoryLabels]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,.6fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Recent reviewed history</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your latest trusted facts across all documents.
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-teal-700"
              href="/search"
            >
              Search
            </Link>
          </div>
          {facts.length ? (
            <ol className="mt-5 space-y-4">
              {facts.slice(0, 8).map((event) => (
                <li className="border-l-2 border-teal-200 pl-4" key={event.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold capitalize text-teal-800">
                        {categoryLabels[
                          event.category as keyof typeof categoryLabels
                        ] ?? event.category}
                      </span>
                      <h3 className="mt-2 font-semibold">{event.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {event.description}
                      </p>
                    </div>
                    <time className="text-xs text-slate-500">
                      {new Date(event.date).toLocaleDateString()}
                    </time>
                  </div>
                  <Link
                    className="mt-2 inline-block text-sm font-semibold text-teal-700"
                    href={event.reviewHref ?? event.sourceHref}
                  >
                    View source
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <h3 className="font-semibold">No trusted history yet</h3>
              <p className="mt-2 text-sm text-slate-500">
                Review extracted facts from a document to build your history.
              </p>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Needs your review</h2>
          <p className="mt-1 text-sm text-slate-500">
            Nothing becomes trusted until you decide.
          </p>
          {attention.length ? (
            <ul className="mt-5 space-y-4">
              {attention.slice(0, 5).map((document) => {
                const counts = reviewByDocument.get(document.id) ?? {
                  total: 0,
                  reviewed: 0,
                };
                const remaining = Math.max(0, counts.total - counts.reviewed);
                return (
                  <li className="rounded-xl bg-amber-50 p-4" key={document.id}>
                    <p className="truncate font-semibold">
                      {document.display_name}
                    </p>
                    <p className="mt-1 text-sm text-amber-900">
                      {remaining} fact{remaining === 1 ? "" : "s"} remaining
                    </p>
                    <Link
                      className="mt-3 inline-flex rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
                      href={`/records/${document.id}/review`}
                    >
                      Continue review
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-5 rounded-xl bg-teal-50 p-4 text-sm text-teal-900">
              You are caught up. No documents need review.
            </div>
          )}
        </aside>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <details>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Document library</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {documents?.length ?? 0} uploaded files. Open to manage source
                  documents.
                </p>
              </div>
              <span className="rounded-lg border px-3 py-2 text-sm font-semibold">
                Show documents
              </span>
            </div>
          </summary>
          <div className="mt-5 divide-y divide-slate-100">
            {documents?.map((document) => {
              const counts = reviewByDocument.get(document.id) ?? {
                total: 0,
                reviewed: 0,
              };
              return (
                <article
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                  key={document.id}
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {document.display_name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {document.document_type ?? "Medical document"} · Uploaded{" "}
                      {new Date(document.created_at).toLocaleDateString()} ·{" "}
                      {counts.reviewed}/{counts.total} reviewed
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize">
                      {document.processing_status.replace("_", " ")}
                    </span>
                    <Link
                      className="rounded-lg border px-3 py-2 text-sm font-semibold"
                      href={`/records/${document.id}`}
                    >
                      Open
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      </section>
    </AppShell>
  );
}
