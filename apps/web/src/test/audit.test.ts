import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { auditActions, safeAuditMetadata } from "@/features/audit/model";
import { recordAuditEvent } from "@/features/audit/server";

vi.mock("server-only", () => ({}));

describe("audit event recording", () => {
  it("keeps only bounded allowlisted non-PHI metadata", () => {
    const metadata = safeAuditMetadata("succeeded", {
      result_count: 4,
      category: "labs",
      source_route: "/search",
      query_text: "private search",
      question: "private question",
      ocr_text: "private OCR",
      filename: "patient-name.pdf",
      token: "secret-token",
    } as Record<string, string | number>);
    expect(metadata).toMatchObject({
      status: "succeeded",
      result_count: 4,
      category: "labs",
      source_route: "/search",
    });
    expect(JSON.stringify(metadata)).not.toMatch(
      /private|patient-name|secret-token/,
    );
  });

  it("writes one server-side event with the existing audit shape", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ insert })) };
    await expect(
      recordAuditEvent(
        {
          actorUserId: "00000000-0000-4000-8000-000000000001",
          action: "document.upload_completed",
          resourceType: "document",
          resourceId: "00000000-0000-4000-8000-000000000002",
          status: "succeeded",
          metadata: { mime_type: "application/pdf" },
        },
        client as never,
      ),
    ).resolves.toBe(true);
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0].metadata).not.toHaveProperty("filename");
  });

  it("does not change application behavior when a non-critical audit write fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = {
      from: vi.fn(() => ({
        insert: vi
          .fn()
          .mockResolvedValue({ error: new Error("database detail") }),
      })),
    };
    await expect(
      recordAuditEvent(
        {
          actorUserId: null,
          action: "auth.login_failed",
          resourceType: "session",
          status: "failed",
          metadata: { error_code: "INVALID_CREDENTIALS" },
        },
        client as never,
      ),
    ).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"errorCode":"AUDIT_WRITE_FAILED"'));
    expect(warn.mock.calls[0][0]).not.toContain("database detail");
    warn.mockRestore();
  });

  it("defines review, search, Ask, auth, upload, and processing actions", () => {
    expect(auditActions).toEqual(
      expect.arrayContaining([
        "review.approved",
        "review.corrected",
        "review.rejected",
        "search.executed",
        "ask.executed",
        "auth.logout_succeeded",
        "document.upload_completed",
        "processing.completed",
        "processing.failed",
      ]),
    );
  });

  it("preserves owner-only reads and blocks browser writes in the foundation schema", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/202609090001_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("grant select on public.%I to authenticated");
    expect(sql).toContain(
      "create policy owner_select on public.%I for select to authenticated using (user_id=(select auth.uid()))",
    );
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*audit_logs/i);
    const appendOnly = readFileSync(resolve(process.cwd(), "../../supabase/migrations/202609140001_audit_log_append_only.sql"), "utf8");
    expect(appendOnly).toContain("revoke update, delete, truncate on table public.audit_logs from service_role");
    expect(appendOnly).toContain("grant select, insert on table public.audit_logs to service_role");
  });
});
