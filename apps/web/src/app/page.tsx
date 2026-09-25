import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

const steps = [
  ["Upload", "Add a PDF or photo to your private archive."],
  [
    "Review",
    "Check every AI-assisted result against its source before trusting it.",
  ],
  [
    "Use",
    "Search your reviewed history, build a timeline, ask questions, or export it.",
  ],
];

export default function Home() {
  return (
    <PublicShell>
      <main>
        <section className="hero-grid overflow-hidden border-b border-slate-200">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                Your records, made usable
              </p>
              <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl">
                Your health history, organized around evidence.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                MedMemory turns scattered medical documents into a private,
                searchable archive. Every extracted fact stays linked to the
                page it came from, and you decide what is trusted.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  className="rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white shadow-sm hover:bg-teal-900"
                  href="/signup"
                >
                  Create your archive
                </Link>
                <Link
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 hover:border-teal-700"
                  href="/how-it-works"
                >
                  See how it works
                </Link>
              </div>
              <p className="mt-5 text-sm text-slate-500">
                Beta software · Review before relying on extracted information
              </p>
            </div>
            <aside className="self-center rounded-3xl border border-teal-100 bg-white p-7 shadow-[0_24px_70px_-35px_rgba(15,118,110,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                Built for trust
              </p>
              <ul className="mt-6 space-y-5">
                <li>
                  <strong className="block text-slate-950">
                    Source-linked
                  </strong>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    Open the original page behind a result.
                  </span>
                </li>
                <li>
                  <strong className="block text-slate-950">Review-first</strong>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    Approve, correct, or reject extracted details.
                  </span>
                </li>
                <li>
                  <strong className="block text-slate-950">
                    Private by default
                  </strong>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    User-owned records with protected storage and database
                    access.
                  </span>
                </li>
                <li>
                  <strong className="block text-slate-950">Portable</strong>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    Export your reviewed data or delete your account.
                  </span>
                </li>
              </ul>
            </aside>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            A clear workflow
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            From document to reviewed history
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map(([title, description], index) => (
              <article
                className="rounded-2xl border border-slate-200 bg-white p-6"
                key={title}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                  {index + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">
                  {title}
                </h3>
                <p className="mt-2 leading-7 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="border-y border-amber-200 bg-amber-50/70">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <h2 className="font-semibold text-amber-950">
              AI assistance has limits
            </h2>
            <p className="mt-2 max-w-4xl leading-7 text-amber-900">
              Extraction and answers can be incomplete or wrong. Compare
              important information with the original document and consult a
              qualified clinician for medical decisions. MedMemory is not an
              emergency service.
            </p>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
