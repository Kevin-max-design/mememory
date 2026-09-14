import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";
import {
  safeAuditMetadata,
  type AuditAction,
  type AuditStatus,
  type SafeAuditValue,
} from "./model";

export type AuditEvent = {
  actorUserId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  status: AuditStatus;
  metadata?: Record<string, SafeAuditValue>;
  requestId?: string;
};

export async function recordAuditEvent(
  event: AuditEvent,
  client?: SupabaseClient<Database>,
): Promise<boolean> {
  try {
    const admin = client ?? createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      user_id: event.actorUserId,
      action: event.action,
      resource_type: event.resourceType.slice(0, 100),
      resource_id: event.resourceId ?? null,
      metadata: safeAuditMetadata(
        event.status,
        event.metadata,
        event.requestId,
      ),
    });
    if (error) throw new Error("AUDIT_WRITE_FAILED");
    return true;
  } catch {
    console.warn("audit_write_failed", { action: event.action });
    return false;
  }
}
