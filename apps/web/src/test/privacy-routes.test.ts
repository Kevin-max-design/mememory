import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  deleteDocument: vi.fn(),
  deleteAccount: vi.fn(),
  exportData: vi.fn(),
  audit: vi.fn().mockResolvedValue(true),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ marker: "server-only-admin" }) }));
vi.mock("@/features/privacy/deletion", () => ({ deleteOwnedDocument: mocks.deleteDocument, deleteOwnedAccountData: mocks.deleteAccount }));
vi.mock("@/features/privacy/export", () => ({ buildUserExport: mocks.exportData }));
vi.mock("@/features/audit/server", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: async () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }) }));

const userId = "00000000-0000-4000-8000-000000000001";
const documentId = "00000000-0000-4000-8000-000000000003";

describe("privacy routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId, last_sign_in_at: new Date().toISOString() } }, error: null });
  });

  it("derives document ownership from the authenticated session", async () => {
    mocks.deleteDocument.mockResolvedValue({ ok: true, alreadyDeleted: false });
    const { DELETE } = await import("@/app/api/privacy/documents/[id]/route");
    const response = await DELETE(new Request("http://localhost/api/privacy/documents/x", { method: "DELETE", headers: { "x-medmemory-confirm": "delete-document" } }), { params: Promise.resolve({ id: documentId }) });
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.deleteDocument).toHaveBeenCalledWith(expect.anything(), userId, documentId);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "document.deleted", actorUserId: userId }));
  });

  it("rejects unauthenticated deletion before privileged code runs", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { DELETE } = await import("@/app/api/privacy/documents/[id]/route");
    const response = await DELETE(new Request("http://localhost", { method: "DELETE", headers: { "x-medmemory-confirm": "delete-document" } }), { params: Promise.resolve({ id: documentId }) });
    expect(response.status).toBe(401);
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it("requires an explicit document deletion confirmation", async () => {
    const { DELETE } = await import("@/app/api/privacy/documents/[id]/route");
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: documentId }) });
    expect(response.status).toBe(400);
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it("exports a non-cacheable attachment and never accepts a target user", async () => {
    mocks.exportData.mockResolvedValue({ format: "medmemory-user-export", version: 1, documents: [] });
    const { GET } = await import("@/app/api/privacy/export/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("medmemory-export.json");
    expect(await response.json()).toEqual({ format: "medmemory-user-export", version: 1, documents: [] });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "data.exported", actorUserId: userId }));
  });

  it("requires explicit confirmation and a recent sign-in for account deletion", async () => {
    const { DELETE } = await import("@/app/api/privacy/account/route");
    const missing = await DELETE(new Request("http://localhost", { method: "DELETE", body: "{}" }));
    expect(missing.status).toBe(400);
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId, last_sign_in_at: "2020-01-01T00:00:00Z" } }, error: null });
    const stale = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }) }));
    expect(stale.status).toBe(403);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes only the current auth account and reports partial failure safely", async () => {
    mocks.deleteAccount.mockResolvedValueOnce({ ok: false, code: "STORAGE_DELETE_FAILED" });
    const { DELETE } = await import("@/app/api/privacy/account/route");
    const response = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT", userId: "00000000-0000-4000-8000-000000000099" }) }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "account_delete_failed" });
    expect(mocks.deleteAccount).toHaveBeenCalledWith(expect.anything(), userId);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "account.deletion_failed", metadata: expect.objectContaining({ error_code: "STORAGE_DELETE_FAILED" }) }), expect.anything());
  });

  it("exports explicit owner-scoped fields without worker or storage internals", () => {
    const source = readFileSync(resolve(process.cwd(), "src/features/privacy/export.ts"), "utf8");
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('["approved", "corrected"]');
    expect(source).not.toMatch(/select\([^)]*(storage_path|lock_token|last_error_message|ip_hash)/);
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
