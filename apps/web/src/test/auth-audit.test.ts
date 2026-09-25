import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(true),
  login: vi.fn(),
  signup: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/audit/server", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword: mocks.login, signUp: mocks.signup },
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
});
