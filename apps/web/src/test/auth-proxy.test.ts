import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.fn();
const checkRateLimit = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/features/rate-limit/server", () => ({ checkRateLimit }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims } })),
}));

describe("authentication proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaims.mockReset();
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0, remaining: 10, degraded: false });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  });

  it("redirects anonymous dashboard requests to login", async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: new Error("missing session"),
    });
    const { refreshSession } = await import("@/lib/supabase/proxy");
    const response = await refreshSession(
      new NextRequest("https://medmemory.test/dashboard"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://medmemory.test/login?error=auth_required",
    );
  });

  it("allows a verified authenticated dashboard request", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "patient-id" } },
      error: null,
    });
    const { refreshSession } = await import("@/lib/supabase/proxy");
    const response = await refreshSession(
      new NextRequest("https://medmemory.test/dashboard"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects authenticated users away from login", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "patient-id" } },
      error: null,
    });
    const { refreshSession } = await import("@/lib/supabase/proxy");
    const response = await refreshSession(
      new NextRequest("https://medmemory.test/login"),
    );
    expect(response.headers.get("location")).toBe(
      "https://medmemory.test/dashboard",
    );
  });

  it("returns 429 with Retry-After before an expensive Ask request executes", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "patient-id" } }, error: null });
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 37, remaining: 0, degraded: false });
    const { refreshSession } = await import("@/lib/supabase/proxy");
    const response = await refreshSession(new NextRequest("https://medmemory.test/ask?q=private"));
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("37");
    expect(await response.json()).toEqual({ code: "rate_limit_exceeded" });
  });

  it("blocks a concurrent duplicate Ask request without exposing the question", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "patient-id" } }, error: null });
    checkRateLimit.mockResolvedValueOnce({ allowed: true, retryAfter: 0, remaining: 19, degraded: false }).mockResolvedValueOnce({ allowed: false, retryAfter: 5, remaining: 0, degraded: false });
    const { refreshSession } = await import("@/lib/supabase/proxy");
    const response = await refreshSession(new NextRequest("https://medmemory.test/ask?q=private-question"));
    expect(response.status).toBe(429); expect(await response.json()).toEqual({ code: "duplicate_request" });
    expect(JSON.stringify(checkRateLimit.mock.calls)).not.toContain("private-question");
  });
});
