import { AppShell } from "@/components/app-shell";
import { MedicalHelpOrganizer } from "@/components/medical-help-organizer";
import { requireUser } from "@/server/auth/require-user";

export default async function MedicalHelpPage() {
  await requireUser();
  return (
    <AppShell
      active="help"
      description="Organize what is happening and your reviewed history for a healthcare professional."
      title="I need medical help"
    >
      <MedicalHelpOrganizer />
    </AppShell>
  );
}
