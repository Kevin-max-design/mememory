import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { logServerEvent, sanitizeLogFields } from "@/features/observability/logger";

vi.mock("server-only", () => ({}));
const readinessQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ limit: readinessQuery }) }),
  }),
}));

afterEach(() => vi.unstubAllEnvs());

describe("production observability and deployment hardening", () => {
  it("emits only allowlisted structured fields", () => {
    const safe = sanitizeLogFields({
      event: "upload.failed",
      requestId: "request_1",
      route: "/api/documents",
      httpStatus: 400,
      durationMs: 12,
      errorCode: "INVALID_FILE",
      query: "private search",
      question: "private question",
      filename: "patient.pdf",
      rawIp: "192.0.2.1",
      secret: "hidden",
      stack: "private stack",
    });
    expect(safe).toEqual({ event: "upload.failed", requestId: "request_1", route: "/api/documents", httpStatus: 400, durationMs: 12, errorCode: "INVALID_FILE" });
    expect(JSON.stringify(safe)).not.toMatch(/private|patient|192\.0\.2\.1|hidden/);
  });

  it("rejects malformed events and writes one JSON line for safe events", () => {
    const sink = vi.fn();
    expect(logServerEvent({ event: "bad event" }, sink)).toBe(false);
    expect(logServerEvent({ event: "search.completed", durationMs: 4, environment: "test" }, sink)).toBe(true);
    expect(JSON.parse(sink.mock.calls[0][0])).toEqual({ event: "search.completed", durationMs: 4, environment: "test" });
  });

  it("returns a cheap, non-cacheable health response", async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, status: "healthy" });
  });

  it("reports readiness without exposing dependency details", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(32));
    vi.stubEnv("DOCUMENT_PROCESSOR_URL", "http://127.0.0.1:8000");
    vi.stubEnv("DOCUMENT_PROCESSOR_SECRET", "p".repeat(32));
    vi.stubEnv("RATE_LIMIT_HASH_SECRET", "r".repeat(32));
    readinessQuery.mockResolvedValueOnce({ error: null });
    const { GET } = await import("@/app/api/ready/route");
    const ready = await GET();
    expect(ready.status).toBe(200);
    expect(ready.headers.get("cache-control")).toBe("no-store");
    readinessQuery.mockResolvedValueOnce({ error: new Error("private database detail") });
    const unavailable = await GET();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ ok: false, code: "not_ready" });
  });
});
