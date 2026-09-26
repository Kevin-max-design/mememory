import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DocumentUpload } from "@/components/document-upload";
import { AccountPrivacyControls } from "@/components/privacy-controls";
import { UiIcon, type IconName } from "@/components/ui-icons";
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
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
            href="/medical-help"
          >
            <UiIcon className="h-4 w-4" name="pulse" />
            Medical help
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
            href="#upload"
          >
            <UiIcon className="h-4 w-4" name="upload" />
            Upload record
          </Link>
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

      <div className="mt-6 flex gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 px-5 py-4 text-sm leading-6 text-slate-600">
        <UiIcon className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" name="shield" />
        <p>
          <strong className="text-teal-800">Review-first information:</strong>{" "}
          This view uses facts you approved or corrected from uploaded records.
          It may still contain errors and is not medical advice.
        </p>
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(300px,.72fr)_minmax(0,1.28fr)]">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 text-lg font-semibold">
              <UiIcon className="h-5 w-5 text-teal-700" name="pulse" />
              Health snapshot
            </h2>
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

        <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
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

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction description="Add a PDF or photo" href="#upload" icon="upload" label="Upload record" />
        <QuickAction description="Questions with sources" href="/ask" icon="message" label="Ask my records" />
        <QuickAction description="Printable reviewed summary" href="/doctor-brief" icon="brief" label="Doctor brief" />
        <QuickAction description="Patient-controlled access" href="/emergency" icon="shield" label="Emergency card" />
      </section>

      {attention.length ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
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
        className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8"
        id="upload"
      >
        <h2 className="text-xl font-bold">Upload a medical record</h2>
        <p className="mt-2 text-sm text-slate-600">
          Add a private PDF, scan, or photo. Extracted facts require your
          review.
        </p>
        <DocumentUpload />
      </section>

      <details className="mt-6 rounded-2xl border border-slate-200/80 bg-white" id="privacy">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
          <span>
            <span className="block font-semibold">Privacy & data controls</span>
            <span className="mt-1 block text-sm text-slate-500">Export your information or manage account deletion.</span>
          </span>
          <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Open controls</span>
        </summary>
        <div className="border-t border-slate-100 px-6 pb-6">
          <AccountPrivacyControls />
        </div>
      </details>
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
  description,
}: {
  href: string;
  icon: IconName;
  label: string;
  description: string;
}) {
  return (
    <Link
      className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-teal-200 hover:shadow-md"
      href={href}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-100">
        <UiIcon className="h-5 w-5" name={icon} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-400">{description}</span>
      </span>
    </Link>
  );
}
