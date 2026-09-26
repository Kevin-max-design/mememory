import { AppShell } from "@/components/app-shell";
import { EmergencyProfileEditor } from "@/components/emergency-profile-editor";
import { getTimelineEventsForUser } from "@/features/timeline/data";
import { requireUser } from "@/server/auth/require-user";

type Contact = { name?: string | null; phone?: string | null };

export default async function EmergencyPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: emergency }, events] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase
      .from("emergency_profiles")
      .select(
        "enabled,full_name,blood_group,allergies_summary,medications_summary,conditions_summary,emergency_contacts,warnings,enabled_fields",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    getTimelineEventsForUser(supabase, user.id),
  ]);
  const facts = events.filter((event) => event.category !== "documents");
  const summarize = (category: string) =>
    facts
      .filter((event) => event.category === category)
      .slice(0, 8)
      .map((event) => event.title.replace(/^[^:]+:\s*/, ""))
      .join("; ");
  const contacts = Array.isArray(emergency?.emergency_contacts)
    ? (emergency.emergency_contacts as Contact[])
    : [];

  return (
    <AppShell
      active="emergency"
      description="Choose the critical information available on your emergency card and control public access."
      title="Emergency summary"
    >
      <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-950">
        <strong>Privacy and safety:</strong> This summary may be incomplete and
        is not a substitute for professional care. Public access is off unless
        you explicitly enable it, select fields, and confirm disclosure.
      </div>
      <EmergencyProfileEditor
        initial={{
          enabled: emergency?.enabled ?? false,
          fullName: emergency?.full_name ?? profile?.full_name ?? "",
          bloodGroup: emergency?.blood_group ?? "",
          allergiesSummary:
            emergency?.allergies_summary ?? summarize("allergies"),
          medicationsSummary:
            emergency?.medications_summary ?? summarize("medications"),
          conditionsSummary:
            emergency?.conditions_summary ?? summarize("diagnoses"),
          warnings: emergency?.warnings ?? "",
          contactName: contacts[0]?.name ?? "",
          contactPhone: contacts[0]?.phone ?? "",
          enabledFields: emergency?.enabled_fields ?? [
            "full_name",
            "blood_group",
            "allergies_summary",
            "conditions_summary",
            "medications_summary",
            "emergency_contacts",
          ],
        }}
      />
    </AppShell>
  );
}
