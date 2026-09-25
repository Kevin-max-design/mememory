import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { ownedDocumentStoragePaths } from "./storage-path";

type Admin = SupabaseClient<Database>;

export async function deleteOwnedDocument(admin: Admin, userId: string, documentId: string) {
  const { data: document, error } = await admin.from("documents")
    .select("id,user_id,storage_path,normalized_storage_path")
    .eq("id", documentId).eq("user_id", userId).maybeSingle();
  if (error) return { ok: false as const, code: "DOCUMENT_LOOKUP_FAILED" };
  if (!document) return { ok: true as const, alreadyDeleted: true };
  const paths = ownedDocumentStoragePaths({ userId, documentId, storagePath: document.storage_path, normalizedStoragePath: document.normalized_storage_path });
  if (!paths) return { ok: false as const, code: "STORAGE_PATH_INVALID" };
  const { error: storageError } = await admin.storage.from("medical-records").remove(paths);
  if (storageError) return { ok: false as const, code: "STORAGE_DELETE_FAILED" };
  const { error: deleteError } = await admin.from("documents").delete().eq("id", documentId).eq("user_id", userId);
  if (deleteError) return { ok: false as const, code: "DOCUMENT_DELETE_FAILED" };
  return { ok: true as const, alreadyDeleted: false };
}

export async function deleteOwnedAccountData(admin: Admin, userId: string) {
  const { error: markerError } = await admin.from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() }).eq("id", userId);
  if (markerError) return { ok: false as const, code: "ACCOUNT_DELETION_MARKER_FAILED" };

  const { data: documents, error } = await admin.from("documents")
    .select("id,user_id,storage_path,normalized_storage_path,processing_status").eq("user_id", userId);
  if (error) return { ok: false as const, code: "ACCOUNT_DATA_LOOKUP_FAILED" };
  if ((documents ?? []).some((document) => document.processing_status === "uploaded")) {
    return { ok: false as const, code: "ACCOUNT_OPERATIONS_ACTIVE" };
  }
  const paths: string[] = [];
  for (const document of documents ?? []) {
    const owned = ownedDocumentStoragePaths({ userId, documentId: document.id, storagePath: document.storage_path, normalizedStoragePath: document.normalized_storage_path });
    if (!owned) return { ok: false as const, code: "STORAGE_PATH_INVALID" };
    paths.push(...owned);
  }
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error: storageError } = await admin.storage.from("medical-records").remove(paths.slice(offset, offset + 100));
    if (storageError) return { ok: false as const, code: "STORAGE_DELETE_FAILED" };
  }
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) return { ok: false as const, code: "AUTH_ACCOUNT_DELETE_FAILED" };
  return { ok: true as const, documentCount: documents?.length ?? 0 };
}
