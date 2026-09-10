import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims } })),
}));

describe("authentication proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaims.mockReset();
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
});
