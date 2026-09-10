import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut } })),
}));
vi.mock("next/navigation", () => ({ redirect }));

describe("logout", () => {
  beforeEach(() => {
    signOut.mockReset();
    redirect.mockClear();
  });

  it("invalidates the local application session and redirects", async () => {
    signOut.mockResolvedValue({ error: null });
    const { logout } = await import("@/features/auth/actions");
    await expect(logout()).rejects.toThrow(
      "REDIRECT:/login?message=signed_out",
    );
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("reports sign-out failures explicitly", async () => {
    signOut.mockResolvedValue({ error: new Error("upstream detail") });
    const { logout } = await import("@/features/auth/actions");
    await expect(logout()).rejects.toThrow(
      "REDIRECT:/dashboard?error=signout_failed",
    );
  });
});
