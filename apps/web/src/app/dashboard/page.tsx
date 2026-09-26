import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DocumentUpload } from "@/components/document-upload";
import { AccountPrivacyControls } from "@/components/privacy-controls";
import { logout } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/errors";
import { getTimelineEventsForUser } from "@/features/timeline/data";
import { requireUser } from "@/server/auth/require-user";

function withoutPrefix(value: string) {
  return value.replace(/^(Diagnosis|Allergy|Medication):\s*/i, "");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; welcome?: string }>;
}) {
  const query = await searchParams;
  const notice = authErrorMessage(query.error);
  const { supabase, user } = await requireUser();
  const [profileResult, documentsResult, recordsResult, timelineEvents] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("documents")
        .select(
          "id,display_name,mime_type,file_size,processing_status,created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("medical_records")
        .select("document_id,review_status")
        .eq("user_id", user.id),
      getTimelineEventsForUser(supabase, user.id),
    ]);
  const { data: profile, error } = profileResult;
  if (error) throw new Error("PROFILE_READ_FAILED");
  const { data: documents, error: documentsError } = documentsResult;
  if (documentsError) throw new Error("DOCUMENT_LIST_FAILED");
  if (recordsResult.error) throw new Error("RECORD_STATUS_READ_FAILED");

  const facts = timelineEvents.filter(
    (event) => event.category !== "documents",
  );
  const conditions = facts.filter((event) => event.category === "diagnoses");
  const allergies = facts.filter((event) => event.category === "allergies");
  const medications = facts.filter((event) => event.category === "medications");
  const pendingDocumentIds = new Set(
    (recordsResult.data ?? [])
      .filter((record) => record.review_status === "extracted")
      .map((record) => record.document_id),
  );
  const attention = (documents ?? []).filter(
    (document) =>
      document.processing_status === "needs_review" &&
      pendingDocumentIds.has(document.id),
  );
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <AppShell
      actions={
        <>
          <Link
            className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
            href="/medical-help"
          >
            I need medical help
          </Link>
          <Link
            className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
            href="#upload"
          >
            ＋ Upload medical record
          </Link>
          <form action={logout}>
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </>
      }
      active="overview"
      description="Your health memory, organized in one private place."
      title={firstName ? `Good day, ${firstName}` : "Your health overview"}
    >
      {notice ? (
        <p
          className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {notice}
        </p>
      ) : null}
      {query.welcome === "1" ? (
        <section className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">
            Start here
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            Your private archive is ready
          </h2>
          <p className="mt-2 text-sm text-teal-900">
            Upload a record, wait for processing, then approve or correct facts
            before they enter your history.
          </p>
        </section>
      ) : null}

      <div className="mt-7 flex gap-3 rounded-2xl border border-slate-300 bg-white px-5 py-4 text-sm text-slate-600">
        <span aria-hidden="true" className="font-bold text-teal-700">
          ↗
        </span>
        <p>
          <strong className="text-teal-800">Review-first information:</strong>{" "}
          This view uses facts you approved or corrected from uploaded records.
          It may still contain errors and is not medical advice.
        </p>
      </div>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(300px,.72fr)_minmax(0,1.28fr)]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">∿ Health snapshot</h2>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-teal-800">
              {facts.length} trusted
            </span>
          </div>
          <div className="mt-7 space-y-6">
            <SnapshotGroup
              empty="No reviewed conditions"
              items={conditions.map((item) => withoutPrefix(item.title))}
              label="Known conditions"
              tone="amber"
            />
            <SnapshotGroup
              empty="No reviewed allergies"
              items={allergies.map((item) => withoutPrefix(item.title))}
              label="Allergies"
              tone="red"
            />
            <SnapshotGroup
              empty="No reviewed medications"
              items={medications.map((item) => withoutPrefix(item.title))}
              label="Current medications in reviewed records"
              tone="slate"
            />
          </div>
          <Link
            className="mt-7 inline-flex text-sm font-semibold text-teal-700"
            href="/records"
          >
            Open full medical history →
          </Link>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Recent medical events</h2>
            <Link
              className="text-sm font-semibold text-teal-700"
              href="/timeline"
            >
              View full timeline →
            </Link>
          </div>
          {facts.length ? (
            <ol className="mt-6 space-y-5 border-l-2 border-slate-200 pl-5">
              {facts.slice(0, 5).map((event) => (
                <li className="relative" key={event.id}>
                  <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-teal-600 bg-white" />
                  <time className="text-xs font-semibold text-slate-400">
                    {new Date(event.date).toLocaleDateString()}
                  </time>
                  <h3 className="mt-1 font-semibold">{event.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {event.description}
                  </p>
                  <Link
                    className="mt-1 inline-block text-xs font-semibold text-teal-700"
                    href={event.reviewHref ?? event.sourceHref}
                  >
                    View source
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="font-semibold">No reviewed history yet</p>
              <p className="mt-2 text-sm text-slate-500">
                Approved or corrected facts will appear here.
              </p>
            </div>
          )}
        </article>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <QuickAction href="#upload" icon="＋" label="Upload record" />
        <QuickAction href="/medical-help" icon="∿" label="Get medical help" />
        <QuickAction href="/doctor-brief" icon="▧" label="Doctor brief" />
        <QuickAction href="/emergency" icon="◇" label="Emergency summary" />
        <QuickAction href="/ask" icon="□" label="Ask my records" />
      </section>

      {attention.length ? (
        <section className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Needs your review</h2>
              <p className="mt-1 text-sm text-amber-900">
                These facts remain outside your trusted history until you
                decide.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-amber-900">
              {attention.length} document{attention.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {attention.slice(0, 4).map((document) => (
              <Link
                className="rounded-xl bg-white p-4 font-semibold shadow-sm"
                href={`/records/${document.id}/review`}
                key={document.id}
              >
                <span className="block truncate">{document.display_name}</span>
                <span className="mt-1 block text-xs font-normal text-teal-700">
                  Continue review →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section
        className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"
        id="upload"
      >
        <h2 className="text-xl font-bold">Upload a medical record</h2>
        <p className="mt-2 text-sm text-slate-600">
          Add a private PDF, scan, or photo. Extracted facts require your
          review.
        </p>
        <DocumentUpload />
      </section>

      <div id="privacy">
        <AccountPrivacyControls />
      </div>
    </AppShell>
  );
}

function SnapshotGroup({
  label,
  items,
  empty,
  tone,
}: {
  label: string;
  items: string[];
  empty: string;
  tone: "amber" | "red" | "slate";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-50 text-slate-700",
  };
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? (
          items.slice(0, 4).map((item) => (
            <span
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${tones[tone]}`}
              key={item}
            >
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-400">{empty}</span>
        )}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:border-teal-300 hover:-translate-y-0.5"
      href={href}
    >
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-xl text-teal-700">
        {icon}
      </span>
      <span className="mt-3 block text-sm font-bold">{label}</span>
    </Link>
  );
}
