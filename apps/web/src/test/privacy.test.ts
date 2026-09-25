import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { deleteOwnedAccountData, deleteOwnedDocument } from "@/features/privacy/deletion";
import { ownedDocumentStoragePaths } from "@/features/privacy/storage-path";
import { ruleForRequest } from "@/features/rate-limit/model";

vi.mock("server-only", () => ({}));

const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const documentId = "00000000-0000-4000-8000-000000000003";
const storagePath = `${userId}/${documentId}/original/00000000-0000-4000-8000-000000000004.pdf`;

function documentAdmin(document: object | null, options: { storageError?: boolean; deleteError?: boolean } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: document, error: null });
  const selectBuilder = { eq: vi.fn(() => selectBuilder), maybeSingle };
  const deleteBuilder = { eq: vi.fn(() => deleteBuilder), then: (resolveValue: (value: unknown) => void) => resolveValue({ error: options.deleteError ? new Error("failed") : null }) };
  const remove = vi.fn().mockResolvedValue({ error: options.storageError ? new Error("failed") : null });
  const deleteCall = vi.fn(() => deleteBuilder);
  return { client: { from: vi.fn(() => ({ select: vi.fn(() => selectBuilder), delete: deleteCall })), storage: { from: vi.fn(() => ({ remove })) } }, remove, deleteCall, selectBuilder };
}

describe("privacy controls", () => {
  it("accepts only the exact owner/document generated storage prefixes", () => {
    expect(ownedDocumentStoragePaths({ userId, documentId, storagePath })).toEqual([storagePath]);
    expect(ownedDocumentStoragePaths({ userId, documentId, storagePath: `${otherUserId}/${documentId}/original/file.pdf` })).toBeNull();
    expect(ownedDocumentStoragePaths({ userId, documentId, storagePath: `${userId}/${documentId}/original/../private.pdf` })).toBeNull();
  });

  it("removes owner storage before deleting the cascading document row", async () => {
    const admin = documentAdmin({ id: documentId, user_id: userId, storage_path: storagePath, normalized_storage_path: null });
    await expect(deleteOwnedDocument(admin.client as never, userId, documentId)).resolves.toEqual({ ok: true, alreadyDeleted: false });
    expect(admin.remove).toHaveBeenCalledWith([storagePath]);
    expect(admin.deleteCall).toHaveBeenCalledOnce();
    expect(admin.selectBuilder.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("treats absent/cross-user documents idempotently and never touches storage", async () => {
    const admin = documentAdmin(null);
    await expect(deleteOwnedDocument(admin.client as never, userId, documentId)).resolves.toEqual({ ok: true, alreadyDeleted: true });
    expect(admin.remove).not.toHaveBeenCalled();
    expect(admin.deleteCall).not.toHaveBeenCalled();
  });

  it("stops before database deletion when private storage cleanup fails", async () => {
    const admin = documentAdmin({ id: documentId, user_id: userId, storage_path: storagePath, normalized_storage_path: null }, { storageError: true });
    await expect(deleteOwnedDocument(admin.client as never, userId, documentId)).resolves.toEqual({ ok: false, code: "STORAGE_DELETE_FAILED" });
    expect(admin.deleteCall).not.toHaveBeenCalled();
  });

  it("deletes only the authenticated account ID after owner storage cleanup", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ id: documentId, user_id: userId, storage_path: storagePath, normalized_storage_path: null, processing_status: "queued" }], error: null });
    const markerEq = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn((table: string) => table === "profiles" ? { update: () => ({ eq: markerEq }) } : { select: () => ({ eq }) }), storage: { from: () => ({ remove }) }, auth: { admin: { deleteUser } } };
    await expect(deleteOwnedAccountData(client as never, userId)).resolves.toEqual({ ok: true, documentCount: 1 });
    expect(markerEq).toHaveBeenCalledWith("id", userId);
    expect(eq).toHaveBeenCalledWith("user_id", userId);
    expect(deleteUser).toHaveBeenCalledWith(userId);
    expect(deleteUser).not.toHaveBeenCalledWith(otherUserId);
  });

  it("marks deletion first and stops while a reserved upload is active", async () => {
    const markerEq = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockResolvedValue({ data: [{ id: documentId, user_id: userId, storage_path: storagePath, normalized_storage_path: null, processing_status: "uploaded" }], error: null });
    const remove = vi.fn();
    const deleteUser = vi.fn();
    const client = { from: vi.fn((table: string) => table === "profiles" ? { update: () => ({ eq: markerEq }) } : { select: () => ({ eq }) }), storage: { from: () => ({ remove }) }, auth: { admin: { deleteUser } } };
    await expect(deleteOwnedAccountData(client as never, userId)).resolves.toEqual({ ok: false, code: "ACCOUNT_OPERATIONS_ACTIVE" });
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("keeps the deletion marker server-controlled and serializes document inserts", () => {
    const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/202609240001_account_deletion_guard.sql"), "utf8");
    expect(sql).toContain("revoke update on public.profiles from authenticated");
    expect(sql).toContain("grant update(full_name, date_of_birth, blood_group)");
    expect(sql).toContain("for share");
    expect(sql).toContain("ACCOUNT_DELETION_PENDING");
    expect(sql).toContain("before insert on public.documents");
  });

  it("gives export a distinct persistent rate-limit scope", () => {
    expect(ruleForRequest("/api/privacy/export", "GET", false)).toMatchObject({ scope: "export", limit: 3 });
    const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/202609140003_privacy_rate_limit.sql"), "utf8");
    expect(sql).toContain("'preview','export'");
    expect(sql).toContain("revoke execute on function public.check_rate_limit");
  });

  it("preserves audit rows on auth deletion and uses cascades for owned medical data", () => {
    const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/202609090001_foundation.sql"), "utf8");
    expect(sql).toContain("user_id uuid references auth.users(id) on delete set null");
    expect(sql).toContain("foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade");
  });
});
