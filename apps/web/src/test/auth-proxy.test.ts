import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.fn();
const checkRateLimit = vi.fn();
let setAllCookies: ((cookies: { name: string; value: string; options: Record<string, unknown> }[], headers: Record<string, string>) => void) | undefined;
vi.mock("server-only", () => ({}));
vi.mock("@/features/rate-limit/server", () => ({ checkRateLimit }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    setAllCookies = options.cookies.setAll;
    return { auth: { getClaims } };
  }),
}));

describe("authentication proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaims.mockReset();
    setAllCookies = undefined;
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

  it("preserves refreshed session cookies and cache headers on redirects", async () => {
    getClaims.mockImplementation(async () => {
      setAllCookies?.(
        [
          { name: "sb-access", value: "rotated-access", options: { httpOnly: true, sameSite: "lax", path: "/" } },
          { name: "sb-refresh", value: "rotated-refresh", options: { httpOnly: true, sameSite: "lax", path: "/" } },
        ],
        { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" },
      );
      return { data: { claims: { sub: "patient-id" } }, error: null };
    });
    const { refreshSession } = await import("@/lib/supabase/proxy");
    const response = await refreshSession(new NextRequest("https://medmemory.test/login"));
    expect(response.headers.get("location")).toBe("https://medmemory.test/dashboard");
    expect(response.cookies.get("sb-access")?.value).toBe("rotated-access");
    expect(response.cookies.get("sb-refresh")?.value).toBe("rotated-refresh");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
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

  it("keeps timeline and privacy routes inside the session-refresh boundary", async () => {
    const { config } = await import("@/proxy");
    expect(config.matcher).toContain("/timeline");
    expect(config.matcher).toContain("/api/privacy/:path*");
  });

  it("enforces the export limiter through the application proxy", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "patient-id" } },
      error: null,
    });
    checkRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 900,
      remaining: 0,
      degraded: false,
    });
    const { refreshSession } = await import("@/lib/supabase/proxy");
    const response = await refreshSession(
      new NextRequest("https://medmemory.test/api/privacy/export"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "rate_limit_exceeded" });
  });

  it("returns a non-cacheable 503 when the shared limiter is unavailable", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "patient-id" } }, error: null });
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60, remaining: 0, degraded: true, unavailable: true });
    const { refreshSession } = await import("@/lib/supabase/proxy");
    const response = await refreshSession(new NextRequest("https://medmemory.test/search?q=test"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "rate_limit_unavailable" });
  });
});
