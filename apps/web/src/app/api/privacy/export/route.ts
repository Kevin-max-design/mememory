import { recordAuditEvent } from "@/features/audit/server";
import { buildUserExport } from "@/features/privacy/export";
import { requireUser } from "@/server/auth/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await requireUser();
  const data = await buildUserExport();
  await recordAuditEvent({ actorUserId: user.id, action: "data.exported", resourceType: "account", resourceId: user.id, status: "succeeded", metadata: { source_route: "/api/privacy/export" } });
  return new Response(JSON.stringify(data), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="medmemory-export.json"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
