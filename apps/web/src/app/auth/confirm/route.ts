import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { requestCorrelationId } from "@/features/audit/model";
import { recordAuditEvent } from "@/features/audit/server";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>([
  "email",
  "recovery",
  "email_change",
]);

export async function GET(request: NextRequest) {
  const requestId = requestCorrelationId(request);
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get("next");
  const nextPath = next === "/reset-password" ? next : "/dashboard";
  const destination = request.nextUrl.clone();
  destination.search = "";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await recordAuditEvent({ actorUserId: data.user?.id ?? null, action: "auth.email_verified", resourceType: "user", resourceId: data.user?.id, status: "succeeded", metadata: { source_route: "/auth/confirm" }, requestId });
      destination.pathname = nextPath;
      return NextResponse.redirect(destination);
    }
  }

  if (tokenHash && type && allowedTypes.has(type)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      await recordAuditEvent({ actorUserId: data.user?.id ?? null, action: "auth.email_verified", resourceType: "user", resourceId: data.user?.id, status: "succeeded", metadata: { source_route: "/auth/confirm" }, requestId });
      destination.pathname =
        type === "recovery" ? nextPath : "/dashboard";
      return NextResponse.redirect(destination);
    }
  }
  await recordAuditEvent({ actorUserId: null, action: "auth.email_verification_failed", resourceType: "user", status: "failed", metadata: { error_code: "CONFIRMATION_FAILED", source_route: "/auth/confirm" }, requestId });
  destination.pathname = "/login";
  destination.searchParams.set("error", "confirmation_failed");
  return NextResponse.redirect(destination);
}
