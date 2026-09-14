import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "@/features/audit/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";
import { privacySafeIdentityHash, type RateLimitRule } from "./model";

type LocalBucket = { count: number; resetsAt: number };
const localBuckets = new Map<string, LocalBucket>();
const MAX_LOCAL_BUCKETS = 10_000;
const ephemeralHashSecret = randomBytes(32).toString("hex");

export type RateLimitResult = { allowed: boolean; retryAfter: number; remaining: number; degraded: boolean };

function localLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  if (localBuckets.size >= MAX_LOCAL_BUCKETS) for (const [candidate, bucket] of localBuckets) { if (bucket.resetsAt <= now) localBuckets.delete(candidate); }
  if (localBuckets.size >= MAX_LOCAL_BUCKETS && !localBuckets.has(key)) return { allowed: false, retryAfter: rule.windowSeconds, remaining: 0, degraded: true };
  const existing = localBuckets.get(key);
  const bucket = !existing || existing.resetsAt <= now ? { count: 0, resetsAt: now + rule.windowSeconds * 1000 } : existing;
  bucket.count += 1; localBuckets.set(key, bucket);
  return { allowed: bucket.count <= rule.limit, retryAfter: bucket.count <= rule.limit ? 0 : Math.max(1, Math.ceil((bucket.resetsAt-now)/1000)), remaining: Math.max(0, rule.limit-bucket.count), degraded: true };
}

export async function checkRateLimit(input: { rule: RateLimitRule; identityKind: "user" | "ip"; identity: string; actorUserId?: string | null }, client?: SupabaseClient<Database>): Promise<RateLimitResult> {
  const secret = process.env.RATE_LIMIT_HASH_SECRET;
  const keyHash = privacySafeIdentityHash(secret && secret.length >= 32 ? secret : ephemeralHashSecret, input.rule.scope, input.identityKind, input.identity);
  if (!secret || secret.length < 32) return localLimit(keyHash, input.rule);
  try {
    const admin = client ?? createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", { p_scope: input.rule.scope, p_key_hash: keyHash, p_limit: input.rule.limit, p_window_seconds: input.rule.windowSeconds });
    if (error || !data?.[0]) throw new Error("RATE_LIMIT_STORE_FAILED");
    const row = data[0];
    if (!row.allowed && row.first_denial) await recordAuditEvent({ actorUserId: input.actorUserId ?? null, action: "rate_limit.denied", resourceType: "request", status: "failed", metadata: { error_code: "RATE_LIMIT_EXCEEDED", category: input.rule.scope }, requestId: keyHash.slice(0, 32) }, admin);
    return { allowed: row.allowed, retryAfter: row.retry_after_seconds, remaining: row.remaining, degraded: false };
  } catch {
    return localLimit(keyHash, input.rule);
  }
}

export function resetLocalRateLimitsForTests() { localBuckets.clear(); }
