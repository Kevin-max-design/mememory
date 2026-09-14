import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
const getUser = vi.fn();
const recordAuditEvent = vi.fn().mockResolvedValue(true);
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut, getUser } })),
}));
vi.mock("@/features/audit/server", () => ({ recordAuditEvent }));
vi.mock("next/navigation", () => ({ redirect }));

describe("logout", () => {
  beforeEach(() => {
    signOut.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } } });
    redirect.mockClear();
  });

  it("invalidates the local application session and redirects", async () => {
    signOut.mockResolvedValue({ error: null });
    const { logout } = await import("@/features/auth/actions");
    await expect(logout()).rejects.toThrow(
      "REDIRECT:/login?message=signed_out",
    );
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.logout_succeeded" }));
  });

  it("reports sign-out failures explicitly", async () => {
    signOut.mockResolvedValue({ error: new Error("upstream detail") });
    const { logout } = await import("@/features/auth/actions");
    await expect(logout()).rejects.toThrow(
      "REDIRECT:/dashboard?error=signout_failed",
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.logout_failed", metadata: expect.objectContaining({ error_code: "SIGNOUT_FAILED" }) }));
  });
});
