import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  audit: vi.fn().mockResolvedValue(true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ upsert: mocks.upsert }),
  }),
}));
vi.mock("@/features/audit/server", () => ({
  recordAuditEvent: mocks.audit,
}));

const userId = "00000000-0000-4000-8000-000000000001";
const profileId = "00000000-0000-4000-8000-000000000002";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/emergency", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  enabled: true,
  disclosureConfirmed: true,
  fullName: "Synthetic Person",
  bloodGroup: "O+",
  allergiesSummary: "Synthetic allergy",
  medicationsSummary: null,
  conditionsSummary: null,
  warnings: null,
  contactName: "Synthetic Contact",
  contactPhone: "0000000000",
  enabledFields: ["full_name", "blood_group", "allergies_summary"],
};

describe("emergency profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.single.mockResolvedValue({ data: { id: profileId }, error: null });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.upsert.mockReturnValue({ select: mocks.select });
  });

  it("rejects unauthenticated writes before using the admin client", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { PUT } = await import("@/app/api/emergency/route");
    const response = await PUT(request(valid));
    expect(response.status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("requires explicit disclosure confirmation before public access", async () => {
    const { PUT } = await import("@/app/api/emergency/route");
    const response = await PUT(
      request({ ...valid, disclosureConfirmed: false }),
    );
    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stores only a SHA-256 token hash and returns the one-time private path", async () => {
    const { PUT } = await import("@/app/api/emergency/route");
    const response = await PUT(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { publicPath: string };
    const stored = mocks.upsert.mock.calls[0][0];
    expect(stored.user_id).toBe(userId);
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.publicPath).toMatch(/^\/emergency-card\/[A-Za-z0-9_-]+$/);
    expect(body.publicPath).not.toContain(stored.token_hash);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "share.created",
        actorUserId: userId,
      }),
    );
  });

  it("revokes the public token when emergency access is disabled", async () => {
    const { PUT } = await import("@/app/api/emergency/route");
    const response = await PUT(
      request({ ...valid, enabled: false, disclosureConfirmed: false }),
    );
    expect(response.status).toBe(200);
    expect(mocks.upsert.mock.calls[0][0].token_hash).toBeNull();
    expect(await response.json()).toEqual({ ok: true, publicPath: null });
  });
});
