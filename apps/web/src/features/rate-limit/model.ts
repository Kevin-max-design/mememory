import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";

export const rateLimitScopes = ["login", "signup", "verification", "upload", "search", "ask", "ask_duplicate", "preview", "export"] as const;
export type RateLimitScope = (typeof rateLimitScopes)[number];
export type RateLimitRule = { scope: RateLimitScope; limit: number; windowSeconds: number };

const rules: Record<RateLimitScope, RateLimitRule> = {
  login: { scope: "login", limit: 10, windowSeconds: 600 },
  signup: { scope: "signup", limit: 5, windowSeconds: 3600 },
  verification: { scope: "verification", limit: 10, windowSeconds: 3600 },
  upload: { scope: "upload", limit: 10, windowSeconds: 600 },
  search: { scope: "search", limit: 60, windowSeconds: 600 },
  ask: { scope: "ask", limit: 20, windowSeconds: 600 },
  ask_duplicate: { scope: "ask_duplicate", limit: 1, windowSeconds: 5 },
  preview: { scope: "preview", limit: 60, windowSeconds: 600 },
  export: { scope: "export", limit: 3, windowSeconds: 3600 },
};

export const duplicateAskRule = rules.ask_duplicate;
export function requestValueFingerprint(value: string) { return createHash("sha256").update(value).digest("hex"); }

export function ruleForRequest(pathname: string, method: string, hasQuery: boolean): RateLimitRule | null {
  if (pathname === "/login" && method === "POST") return rules.login;
  if (pathname === "/signup" && method === "POST") return rules.signup;
  if (pathname === "/forgot-password" && method === "POST") return rules.verification;
  if (pathname === "/auth/confirm" && method === "GET") return rules.verification;
  if (pathname === "/api/documents" && method === "POST") return rules.upload;
  if (pathname === "/search" && method === "GET" && hasQuery) return rules.search;
  if (pathname === "/ask" && method === "GET" && hasQuery) return rules.ask;
  if (/^\/records\/[0-9a-f-]+(?:\/review)?$/.test(pathname) && method === "GET") return rules.preview;
  if (pathname === "/api/privacy/export" && method === "GET") return rules.export;
  return null;
}

export function privacySafeIdentityHash(secret: string, scope: RateLimitScope, identityKind: "user" | "ip", identity: string) {
  return createHmac("sha256", secret).update(`${scope}:${identityKind}:${identity}`).digest("hex");
}

export const trustedProxyHeaders = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] as const;
export type TrustedProxyHeader = (typeof trustedProxyHeaders)[number];

export function clientAddress(headers: Headers, trustedHeader = process.env.RATE_LIMIT_TRUSTED_PROXY_HEADER) {
  if (!trustedProxyHeaders.includes(trustedHeader as TrustedProxyHeader)) return "unattributed";
  const raw = headers.get(trustedHeader!);
  const candidate = (trustedHeader === "x-forwarded-for" ? raw?.split(",")[0] : raw)?.trim() ?? "";
  return isIP(candidate) ? candidate : "unattributed";
}
