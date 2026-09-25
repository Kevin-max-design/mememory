import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

export default function HowItWorksPage() {
  const items = [
    [
      "1. Upload securely",
      "Add a supported PDF or image. The original is kept in private storage under a server-generated path.",
    ],
    [
      "2. Let processing finish",
      "MedMemory reads native text and uses OCR for scanned pages. Processing status remains visible.",
    ],
    [
      "3. Review every fact",
      "Extracted labs, medications, diagnoses, allergies, procedures, vitals, and notes are candidates until you approve or correct them.",
    ],
    [
      "4. Explore reviewed history",
      "Use timeline, search, and Ask MedMemory with source links. Unreviewed or rejected facts are not treated as trusted.",
    ],
    [
      "5. Stay in control",
      "Export reviewed data, delete individual documents, or delete your account and its associated records.",
    ],
    [
      "6. Check important details",
      "AI can make mistakes. Compare results with the source and ask a clinician when a decision affects your care.",
    ],
  ];
  return (
    <PublicShell>
      <main className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
          How it works
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Build a useful record without losing sight of the source.
        </h1>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {items.map(([title, description]) => (
            <section
              className="rounded-2xl border border-slate-200 bg-white p-6"
              key={title}
            >
              <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
              <p className="mt-2 leading-7 text-slate-600">{description}</p>
            </section>
          ))}
        </div>
        <div className="mt-12 rounded-2xl bg-teal-950 p-8 text-white">
          <h2 className="text-2xl font-semibold">Ready to begin?</h2>
          <p className="mt-2 text-teal-100">
            Start with one document and review the result before adding more.
          </p>
          <Link
            className="mt-6 inline-block rounded-lg bg-white px-5 py-3 font-semibold text-teal-950"
            href="/signup"
          >
            Create account
          </Link>
        </div>
      </main>
    </PublicShell>
  );
}
