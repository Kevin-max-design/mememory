import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(true),
  persist: vi.fn(),
  search: vi.fn(),
  evidence: vi.fn(),
  answer: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/audit/model", async (original) => ({ ...(await original()), requestCorrelationId: () => "request-test-123" }));
vi.mock("@/features/audit/server", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/features/documents/persistence", () => ({ persistValidatedUpload: mocks.persist }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("@/features/search/data", () => ({ searchMedicalRecords: mocks.search }));
vi.mock("@/features/ask/data", () => ({ getAskEvidence: mocks.evidence }));
vi.mock("@/features/ask/provider", () => ({ createQAProvider: () => ({ answer: mocks.answer }) }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: async () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }) }));

describe("audit wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } }, error: null });
  });

  it("records exactly one safe event for upload success and failure", async () => {
    const { POST } = await import("@/app/api/documents/route");
    mocks.persist.mockResolvedValueOnce({ ok: true, documentId: "00000000-0000-4000-8000-000000000002", status: "queued" });
    const form = new FormData();
    form.set("file", new File([new TextEncoder().encode("%PDF-1.7\n%%EOF")], "private-name.pdf", { type: "application/pdf" }));
    expect((await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }))).status).toBe(201);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.audit.mock.calls[0][0])).not.toContain("private-name.pdf");

    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } }, error: null });
    const invalid = new FormData(); invalid.set("file", new File(["bad"], "private-name.exe", { type: "application/octet-stream" }));
    expect((await POST(new Request("http://localhost/api/documents", { method: "POST", body: invalid }))).status).toBe(400);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "document.upload_failed", metadata: expect.objectContaining({ error_code: "UPLOAD_VALIDATION_FAILED" }) }));
  });

  it.each([["approve", "review.approved"], ["correct", "review.corrected"], ["reject", "review.rejected"]] as const)("records %s review", async (reviewAction, auditAction) => {
    const { POST } = await import("@/app/api/records/[id]/review/route");
    mocks.rpc.mockResolvedValue({ data: "completed", error: null });
    const body = reviewAction === "correct"
      ? { action: reviewAction, recordId: "00000000-0000-4000-8000-000000000003", correction: { recordType: "diagnosis", name: "Synthetic condition", code: null, status: null } }
      : { action: reviewAction, recordId: "00000000-0000-4000-8000-000000000003" };
    const response = await POST(new Request("http://localhost/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) });
    expect(response.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: auditAction }));
  });

  it("records search and Ask counts without their input text", async () => {
    mocks.search.mockResolvedValue([]);
    const { default: SearchPage } = await import("@/app/search/page");
    await SearchPage({ searchParams: Promise.resolve({ q: "private search phrase", category: "all" }) });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "search.executed", metadata: expect.not.objectContaining({ query: expect.anything() }) }));

    vi.clearAllMocks(); mocks.evidence.mockResolvedValue([]); mocks.answer.mockResolvedValue({ evidence: [], method: "deterministic", answer: "none", noEvidence: true });
    const { default: AskPage } = await import("@/app/ask/page");
    await AskPage({ searchParams: Promise.resolve({ q: "private clinical question" }) });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ask.executed", metadata: expect.not.objectContaining({ question: expect.anything() }) }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private clinical question");
  });
});
