import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientAddress, privacySafeIdentityHash, requestValueFingerprint, ruleForRequest, type RateLimitRule } from "@/features/rate-limit/model";

const audit = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("server-only", () => ({}));
vi.mock("@/features/audit/server", () => ({ recordAuditEvent: audit }));

const smallRule: RateLimitRule = { scope: "ask", limit: 2, windowSeconds: 600 };

describe("rate limiting and abuse controls", () => {
  beforeEach(async () => { vi.resetModules(); vi.stubEnv("RATE_LIMIT_HASH_SECRET", "r".repeat(32)); vi.stubEnv("RATE_LIMIT_TRUSTED_PROXY_HEADER", "x-real-ip"); audit.mockReset(); audit.mockResolvedValue(true); const { resetLocalRateLimitsForTests } = await import("@/features/rate-limit/server"); resetLocalRateLimitsForTests(); });
  afterEach(() => vi.unstubAllEnvs());

  it("maps each expensive server route to a separate scope", () => {
    expect(ruleForRequest("/login", "POST", false)?.scope).toBe("login");
    expect(ruleForRequest("/signup", "POST", false)?.scope).toBe("signup");
    expect(ruleForRequest("/api/documents", "POST", false)?.scope).toBe("upload");
    expect(ruleForRequest("/search", "GET", true)?.scope).toBe("search");
    expect(ruleForRequest("/ask", "GET", true)?.scope).toBe("ask");
    expect(ruleForRequest("/records/00000000-0000-4000-8000-000000000001/review", "GET", false)?.scope).toBe("preview");
    expect(ruleForRequest("/api/privacy/export", "GET", false)?.scope).toBe("export");
    expect(ruleForRequest("/search", "GET", false)).toBeNull();
  });

  it("allows below-limit requests and returns a stable denial", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ allowed: true, retry_after_seconds: 0, remaining: 1, first_denial: false }], error: null }).mockResolvedValueOnce({ data: [{ allowed: false, retry_after_seconds: 42, remaining: 0, first_denial: true }], error: null });
    const client = { rpc } as never; const { checkRateLimit } = await import("@/features/rate-limit/server");
    await expect(checkRateLimit({ rule: smallRule, identityKind: "user", identity: "user-a", actorUserId: "user-a" }, client)).resolves.toMatchObject({ allowed: true, degraded: false });
    await expect(checkRateLimit({ rule: smallRule, identityKind: "user", identity: "user-a", actorUserId: "user-a" }, client)).resolves.toEqual({ allowed: false, retryAfter: 42, remaining: 0, degraded: false });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "rate_limit.denied", metadata: expect.objectContaining({ error_code: "RATE_LIMIT_EXCEEDED", category: "ask" }) }), client);
  });

  it("keeps different users and unauthenticated addresses in separate fallback buckets", async () => {
    vi.stubEnv("RATE_LIMIT_HASH_SECRET", ""); const { checkRateLimit, resetLocalRateLimitsForTests } = await import("@/features/rate-limit/server"); resetLocalRateLimitsForTests();
    await checkRateLimit({ rule: smallRule, identityKind: "user", identity: "user-a" }); await checkRateLimit({ rule: smallRule, identityKind: "user", identity: "user-a" });
    expect((await checkRateLimit({ rule: smallRule, identityKind: "user", identity: "user-a" })).allowed).toBe(false);
    expect((await checkRateLimit({ rule: smallRule, identityKind: "user", identity: "user-b" })).allowed).toBe(true);
    await checkRateLimit({ rule: smallRule, identityKind: "ip", identity: "192.0.2.1" }); await checkRateLimit({ rule: smallRule, identityKind: "ip", identity: "192.0.2.1" });
    expect((await checkRateLimit({ rule: smallRule, identityKind: "ip", identity: "192.0.2.1" })).allowed).toBe(false);
    expect((await checkRateLimit({ rule: smallRule, identityKind: "ip", identity: "192.0.2.2" })).allowed).toBe(true);
  });

  it("falls back locally when persistent storage fails and never persists raw identity", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("unavailable") }) } as never;
    const { checkRateLimit } = await import("@/features/rate-limit/server");
    const result = await checkRateLimit({ rule: smallRule, identityKind: "ip", identity: "203.0.113.8" }, client);
    expect(result).toMatchObject({ allowed: true, degraded: true });
    const rpcArgs = (client as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls[0][1];
    expect(rpcArgs.p_key_hash).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(rpcArgs)).not.toContain("203.0.113.8");
  });

  it("fails closed when the persistent limiter is unavailable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("unavailable") }) } as never;
    const { checkRateLimit } = await import("@/features/rate-limit/server");
    await expect(checkRateLimit({ rule: smallRule, identityKind: "ip", identity: "203.0.113.8" }, client)).resolves.toEqual({ allowed: false, retryAfter: 600, remaining: 0, degraded: true, unavailable: true });
  });

  it("preserves a database denial when audit recording fails", async () => {
    audit.mockRejectedValueOnce(new Error("audit unavailable"));
    const client = { rpc: vi.fn().mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 42, remaining: 0, first_denial: true }], error: null }) } as never;
    const { checkRateLimit } = await import("@/features/rate-limit/server");
    await expect(checkRateLimit({ rule: smallRule, identityKind: "ip", identity: "203.0.113.8" }, client)).resolves.toEqual({ allowed: false, retryAfter: 42, remaining: 0, degraded: false });
  });

  it("hashes raw addresses and distinguishes identities", () => {
    const one = privacySafeIdentityHash("s".repeat(32), "login", "ip", "198.51.100.1");
    const two = privacySafeIdentityHash("s".repeat(32), "login", "ip", "198.51.100.2");
    expect(one).toMatch(/^[a-f0-9]{64}$/); expect(one).not.toContain("198.51.100.1"); expect(one).not.toBe(two);
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.99" }))).toBe("198.51.100.1");
    expect(clientAddress(new Headers({ "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.1" }), "cf-connecting-ip")).toBe("203.0.113.8");
    expect(clientAddress(new Headers({ "x-real-ip": "not-an-ip" }))).toBe("unattributed");
    expect(requestValueFingerprint("private question")).toMatch(/^[a-f0-9]{64}$/);
    expect(requestValueFingerprint("private question")).not.toContain("private question");
  });

  it("retains database guards against processing amplification", () => {
    const foundation = readFileSync(resolve(process.cwd(), "../../supabase/migrations/202609090001_foundation.sql"), "utf8");
    const worker = readFileSync(resolve(process.cwd(), "../../supabase/migrations/202609100002_document_worker.sql"), "utf8");
    expect(foundation).toContain("create unique index one_active_job");
    expect(worker).toContain("grant execute on function public.claim_document_processing_job(integer, uuid) to service_role");
    expect(worker).toContain("candidate.attempt_count < candidate.max_attempts");
  });
});
