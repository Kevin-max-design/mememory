import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { getTimelineEventsForUser } from "@/features/timeline/data";
import { requireUser } from "@/server/auth/require-user";

const categories = [
  ["diagnoses", "Reviewed conditions"],
  ["allergies", "Reviewed allergies"],
  ["medications", "Reviewed medications"],
  ["procedures", "Reviewed procedures"],
  ["labs", "Recent reviewed labs"],
  ["vitals", "Reviewed vitals"],
  ["notes", "Clinical notes"],
] as const;

export default async function DoctorBriefPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, events] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    getTimelineEventsForUser(supabase, user.id),
  ]);
  const facts = events.filter((event) => event.category !== "documents");

  return (
    <AppShell
      actions={<PrintButton />}
      active="brief"
      description="A concise, source-linked handoff built from facts you approved or corrected."
      title="Doctor brief"
    >
      <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 print:border-slate-300 print:bg-white">
        This brief is AI-assisted organization, not medical advice. It can be
        incomplete or wrong. Review it with the original records and your
        healthcare professional.
      </div>

      <article className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9 print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
            MedMemory reviewed-record handoff
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            {profile?.full_name ?? "Patient"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Generated {new Date().toLocaleDateString()} · {facts.length} trusted
            fact{facts.length === 1 ? "" : "s"}
          </p>
        </header>

        {facts.length ? (
          <div className="mt-7 grid gap-7 lg:grid-cols-2">
            {categories.map(([category, label]) => {
              const items = facts.filter(
                (event) => event.category === category,
              );
              if (!items.length) return null;
              return (
                <section key={category}>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    {label}
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {items.slice(0, category === "labs" ? 8 : 6).map((item) => (
                      <li className="rounded-xl bg-slate-50 p-4" key={item.id}>
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.description}
                        </p>
                        <Link
                          className="mt-2 inline-block text-xs font-bold text-teal-700 print:hidden"
                          href={item.reviewHref ?? item.sourceHref}
                        >
                          Verify source →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center">
            <h2 className="text-xl font-bold">No reviewed facts yet</h2>
            <p className="mt-2 text-sm text-slate-500">
              Review extracted facts before creating a handoff.
            </p>
            <Link
              className="mt-5 inline-flex rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white"
              href="/records"
            >
              Review documents
            </Link>
          </div>
        )}
      </article>
    </AppShell>
  );
}
