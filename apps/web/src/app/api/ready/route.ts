import { NextResponse } from "next/server";
import { logServerEvent } from "@/features/observability/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseProductionEnvironment } from "@/schemas/environment";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = performance.now();
  try {
    parseProductionEnvironment(process.env);
    const admin = createAdminClient();
    const { error } = await admin.from("rate_limit_buckets").select("scope", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error("READINESS_DEPENDENCY_FAILED");
    logServerEvent({ event: "readiness.completed", route: "/api/ready", httpStatus: 200, durationMs: Math.round(performance.now()-started), environment: process.env.NODE_ENV });
    return NextResponse.json({ ok: true, status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logServerEvent({ event: "readiness.failed", route: "/api/ready", httpStatus: 503, durationMs: Math.round(performance.now()-started), errorCode: "NOT_READY", environment: process.env.NODE_ENV });
    return NextResponse.json({ ok: false, code: "not_ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
