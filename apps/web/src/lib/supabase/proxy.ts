import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { clientAddress, duplicateAskRule, requestValueFingerprint, ruleForRequest } from "@/features/rate-limit/model";
import { checkRateLimit } from "@/features/rate-limit/server";
import { requestCorrelationId } from "@/features/audit/model";
import { logServerEvent } from "@/features/observability/logger";
import { getSupabasePublicEnvironment } from "./public-environment";

export async function refreshSession(request: NextRequest) {
  const requestId = requestCorrelationId(request);
  let response = NextResponse.next({ request });
  const refreshedCookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
  let refreshHeaders: Record<string, string> = {};
  const finalize = <T extends NextResponse>(target: T) => {
    for (const { name, value, options } of refreshedCookies.values()) target.cookies.set(name, value, options);
    for (const [name, value] of Object.entries(refreshHeaders)) target.headers.set(name, value);
    return target;
  };
  const environment = getSupabasePublicEnvironment();
  const supabase = createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const cookie of cookiesToSet) refreshedCookies.set(cookie.name, cookie);
          refreshHeaders = { ...refreshHeaders, ...headers };
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          finalize(response);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  const authenticated = Boolean(userId);
  const rule = ruleForRequest(request.nextUrl.pathname, request.method, Boolean(request.nextUrl.searchParams.get("q")));
  if (rule) {
    const anonymousScope = rule.scope === "login" || rule.scope === "signup" || rule.scope === "verification";
    const identityKind = userId && !anonymousScope ? "user" : "ip";
    const result = await checkRateLimit({ rule, identityKind, identity: identityKind === "user" ? userId! : clientAddress(request.headers), actorUserId: userId });
    if (!result.allowed) {
      const unavailable = result.unavailable === true;
      const status = unavailable ? 503 : 429;
      const code = unavailable ? "rate_limit_unavailable" : "rate_limit_exceeded";
      logServerEvent({ event: unavailable ? "rate_limit.unavailable" : "rate_limit.denied", requestId, route: request.nextUrl.pathname, httpStatus: status, errorCode: unavailable ? "RATE_LIMIT_STORE_FAILED" : "RATE_LIMIT_EXCEEDED", environment: process.env.NODE_ENV });
      return finalize(NextResponse.json({ code }, { status, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" } }));
    }
    if (rule.scope === "ask") {
      const questionHash = requestValueFingerprint(request.nextUrl.searchParams.get("q") ?? "");
      const duplicate = await checkRateLimit({ rule: duplicateAskRule, identityKind, identity: `${identityKind === "user" ? userId! : clientAddress(request.headers)}:${questionHash}`, actorUserId: userId });
      if (!duplicate.allowed) {
        const unavailable = duplicate.unavailable === true;
        const status = unavailable ? 503 : 429;
        const code = unavailable ? "rate_limit_unavailable" : "duplicate_request";
        logServerEvent({ event: unavailable ? "rate_limit.unavailable" : "rate_limit.duplicate_denied", requestId, route: "/ask", httpStatus: status, errorCode: unavailable ? "RATE_LIMIT_STORE_FAILED" : "DUPLICATE_REQUEST", environment: process.env.NODE_ENV });
        return finalize(NextResponse.json({ code }, { status, headers: { "Retry-After": String(duplicate.retryAfter), "Cache-Control": "no-store" } }));
      }
    }
  }
  const isProtected = request.nextUrl.pathname.startsWith("/dashboard");
  const isAuthPage = ["/login", "/signup", "/forgot-password"].includes(
    request.nextUrl.pathname,
  );

  if (!authenticated && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "auth_required");
    return finalize(NextResponse.redirect(url));
  }
  if (authenticated && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return finalize(NextResponse.redirect(url));
  }
  return finalize(response);
}
