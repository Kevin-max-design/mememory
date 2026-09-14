import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/features/audit/server";
import { logServerEvent } from "@/features/observability/logger";
import { deleteOwnedAccountData } from "@/features/privacy/deletion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const MAX_RECENT_SIGN_IN_MS = 15 * 60 * 1000;

export async function DELETE(request: Request) {
  const session = await createClient();
  const { data: auth, error } = await session.auth.getUser();
  if (error || !auth.user) return NextResponse.json({ code: "unauthenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== "object" || (body as { confirmation?: unknown }).confirmation !== "DELETE MY ACCOUNT") return NextResponse.json({ code: "confirmation_required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const lastSignIn = auth.user.last_sign_in_at ? Date.parse(auth.user.last_sign_in_at) : 0;
  if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > MAX_RECENT_SIGN_IN_MS) return NextResponse.json({ code: "recent_sign_in_required" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const admin = createAdminClient();
  await recordAuditEvent({ actorUserId: auth.user.id, action: "account.deletion_requested", resourceType: "account", status: "succeeded", metadata: { source_route: "/api/privacy/account" } }, admin);
  const result = await deleteOwnedAccountData(admin, auth.user.id);
  if (!result.ok) {
    await recordAuditEvent({ actorUserId: auth.user.id, action: "account.deletion_failed", resourceType: "account", status: "failed", metadata: { error_code: result.code, source_route: "/api/privacy/account" } }, admin);
    logServerEvent({ event: "account.deletion_failed", route: "/api/privacy/account", errorCode: result.code, environment: process.env.NODE_ENV });
    return NextResponse.json({ code: "account_delete_failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  await recordAuditEvent({ actorUserId: null, action: "account.deleted", resourceType: "account", status: "succeeded", metadata: { source_route: "/api/privacy/account" } }, admin);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"cookies", "storage"' } });
}
