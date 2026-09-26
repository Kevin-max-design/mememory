import { AppShell } from "@/components/app-shell";
import { TimelineView } from "@/components/timeline-view";
import { getTimelineEvents } from "@/features/timeline/data";

export default async function TimelinePage() {
  const events = await getTimelineEvents();
  return (
    <AppShell
      active="timeline"
      description="Reviewed facts and source documents arranged by medical date when available."
      title="Medical timeline"
    >
      <TimelineView events={events} />
    </AppShell>
  );
}
