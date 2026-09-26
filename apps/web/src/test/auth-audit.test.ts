import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(true),
  login: vi.fn(),
  signup: vi.fn(),
  requestReset: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/audit/server", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/public-environment", () => ({
  getSupabasePublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    NEXT_PUBLIC_SITE_URL: "https://medmemory.test",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mocks.login,
      signUp: mocks.signup,
      resetPasswordForEmail: mocks.requestReset,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  }),
}));

function credentials() {
  const form = new FormData();
  form.set("email", "person@example.test");
  form.set("password", "correct horse battery");
  return form;
}

describe("server-observable auth auditing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records login success and failure without an email or password", async () => {
    const { login } = await import("@/features/auth/actions");
    mocks.login.mockResolvedValueOnce({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null,
    });
    await expect(login(credentials())).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.login_succeeded" }),
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toMatch(
      /person@example|correct horse/,
    );

    vi.clearAllMocks();
    mocks.login.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("provider detail"),
    });
    await expect(login(credentials())).rejects.toThrow(
      "REDIRECT:/login?error=invalid_credentials",
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login_failed",
        metadata: expect.objectContaining({
          error_code: "INVALID_CREDENTIALS",
        }),
      }),
    );
  });

  it("records signup success without profile fields and redirects the session to the dashboard", async () => {
    const { signup } = await import("@/features/auth/actions");
    mocks.signup.mockResolvedValue({
      data: {
        user: { id: "00000000-0000-4000-8000-000000000001" },
        session: { access_token: "not-logged" },
      },
      error: null,
    });
    const form = credentials();
    form.set("fullName", "Synthetic User");
    form.set("acceptedTerms", "on");
    await expect(signup(form)).rejects.toThrow("REDIRECT:/dashboard?welcome=1");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.signup_succeeded" }),
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(
      "Synthetic User",
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("not-logged");
  });

  it("fails safely when hosted auth does not issue an immediate signup session", async () => {
    const { signup } = await import("@/features/auth/actions");
    mocks.signup.mockResolvedValue({
      data: {
        user: { id: "00000000-0000-4000-8000-000000000001" },
        session: null,
      },
      error: null,
    });
    const form = credentials();
    form.set("fullName", "Synthetic User");
    form.set("acceptedTerms", "on");
    await expect(signup(form)).rejects.toThrow(
      "REDIRECT:/signup?error=signup_session_unavailable",
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.signup_failed",
        metadata: expect.objectContaining({
          error_code: "SIGNUP_SESSION_UNAVAILABLE",
        }),
      }),
    );
  });

  it("uses the same safe signup error for duplicate or other provider failures", async () => {
    const { signup } = await import("@/features/auth/actions");
    mocks.signup.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("user already registered"),
    });
    const form = credentials();
    form.set("fullName", "Synthetic User");
    form.set("acceptedTerms", "on");
    await expect(signup(form)).rejects.toThrow(
      "REDIRECT:/signup?error=signup_failed",
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(
      "user already registered",
    );
  });

  it("requests recovery without exposing account existence", async () => {
    const { requestPasswordReset } = await import("@/features/auth/actions");
    mocks.requestReset.mockResolvedValue({
      data: {},
      error: new Error("account is not registered"),
    });
    const form = new FormData();
    form.set("email", "person@example.test");
    await expect(requestPasswordReset(form)).rejects.toThrow(
      "REDIRECT:/forgot-password?message=sent",
    );
    expect(mocks.requestReset).toHaveBeenCalledWith(
      "person@example.test",
      {
        redirectTo:
          "https://medmemory.test/auth/confirm?next=/reset-password",
      },
    );
  });

  it("updates a recovery-session password and signs out locally", async () => {
    const { resetPassword } = await import("@/features/auth/actions");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ data: {}, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    const form = new FormData();
    form.set("password", "new correct horse battery");
    form.set("confirmPassword", "new correct horse battery");
    await expect(resetPassword(form)).rejects.toThrow(
      "REDIRECT:/login?message=password_updated",
    );
    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "new correct horse battery",
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
