import { randomUUID } from "node:crypto";
import type { Json } from "@/types/database.types";

export const auditActions = [
  "auth.signup_succeeded",
  "auth.signup_failed",
  "auth.login_succeeded",
  "auth.login_failed",
  "auth.logout_succeeded",
  "auth.logout_failed",
  "auth.email_verified",
  "auth.email_verification_failed",
  "document.upload_completed",
  "document.upload_failed",
  "document.viewed",
  "document.preview_requested",
  "document.deleted",
  "processing.claimed",
  "processing.started",
  "processing.completed",
  "processing.failed",
  "review.approved",
  "review.corrected",
  "review.rejected",
  "review.failed",
  "search.executed",
  "ask.executed",
  "account.deletion_requested",
  "account.deleted",
  "account.deletion_failed",
  "data.exported",
  "share.created",
  "share.accessed",
  "admin.action",
  "rate_limit.denied",
] as const;

export type AuditAction = (typeof auditActions)[number];
export type AuditStatus = "succeeded" | "failed";
export type SafeAuditValue = string | number | boolean | null;

const safeMetadataKeys = new Set([
  "status",
  "request_id",
  "error_code",
  "mime_type",
  "page_count",
  "processing_provider",
  "result_count",
  "category",
  "review_action",
  "source_route",
  "fallback_used",
  "retryable",
  "next_status",
  "method",
]);
const forbiddenKey =
  /(text|query|question|filename|url|token|secret|password|authorization|email|content|value|diagnosis|medication|ocr)/i;

export function safeAuditMetadata(
  status: AuditStatus,
  metadata: Record<string, SafeAuditValue> = {},
  requestId: string = randomUUID(),
): Record<string, Json> {
  const safe: Record<string, Json> = { status, request_id: requestId };
  for (const [key, value] of Object.entries(metadata)) {
    if (!safeMetadataKeys.has(key) || forbiddenKey.test(key)) continue;
    if (value === null || typeof value === "boolean") safe[key] = value;
    else if (typeof value === "number" && Number.isFinite(value))
      safe[key] = value;
    else if (
      typeof value === "string" &&
      value.length <= 100 &&
      /^[A-Za-z0-9_./:+ -]*$/.test(value)
    )
      safe[key] = value;
  }
  return safe;
}

export function requestCorrelationId(request?: Request) {
  const supplied = request?.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9_-]{8,80}$/.test(supplied)
    ? supplied
    : randomUUID();
}
