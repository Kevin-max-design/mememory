import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Contact = { name?: string | null; phone?: string | null };

export default async function EmergencyCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) notFound();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("emergency_profiles")
    .select(
      "enabled,full_name,blood_group,allergies_summary,medications_summary,conditions_summary,emergency_contacts,warnings,enabled_fields,updated_at",
    )
    .eq("token_hash", tokenHash)
    .eq("enabled", true)
    .maybeSingle();
  if (!profile) notFound();

  const enabled = new Set(profile.enabled_fields);
  const contacts = Array.isArray(profile.emergency_contacts)
    ? (profile.emergency_contacts as Contact[])
    : [];
  const fields = [
    ["full_name", "Name", profile.full_name],
    ["blood_group", "Blood group", profile.blood_group],
    ["allergies_summary", "Critical allergies", profile.allergies_summary],
    ["conditions_summary", "Conditions", profile.conditions_summary],
    ["medications_summary", "Medications", profile.medications_summary],
    ["warnings", "Warnings", profile.warnings],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10">
      <article className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <header className="bg-red-700 p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-widest">
            MedMemory
          </p>
          <h1 className="mt-2 text-3xl font-bold">Emergency medical summary</h1>
          <p className="mt-2 text-sm text-red-100">
            Patient-controlled information. Verify with the patient, original
            records, and qualified professionals.
          </p>
        </header>
        <div className="space-y-5 p-7">
          {fields.map(([key, label, value]) =>
            enabled.has(key) && value ? (
              <section key={key}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {label}
                </h2>
                <p className="mt-1 whitespace-pre-wrap font-semibold">
                  {value}
                </p>
              </section>
            ) : null,
          )}
          {enabled.has("emergency_contacts") && contacts.length ? (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Emergency contact
              </h2>
              <p className="mt-1 font-semibold">
                {[contacts[0]?.name, contacts[0]?.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </section>
          ) : null}
        </div>
        <footer className="border-t border-slate-200 p-5 text-xs text-slate-500">
          Updated {new Date(profile.updated_at).toLocaleString()} · Not medical
          advice · For emergencies, contact local emergency services.
        </footer>
      </article>
    </main>
  );
}
