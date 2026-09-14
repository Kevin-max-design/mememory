import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { clientAddress, duplicateAskRule, requestValueFingerprint, ruleForRequest } from "@/features/rate-limit/model";
import { checkRateLimit } from "@/features/rate-limit/server";
import { getSupabasePublicEnvironment } from "./public-environment";

export async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const environment = getSupabasePublicEnvironment();
  const supabase = createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
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
    if (!result.allowed) return NextResponse.json({ code: "rate_limit_exceeded" }, { status: 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" } });
    if (rule.scope === "ask") {
      const questionHash = requestValueFingerprint(request.nextUrl.searchParams.get("q") ?? "");
      const duplicate = await checkRateLimit({ rule: duplicateAskRule, identityKind, identity: `${identityKind === "user" ? userId! : clientAddress(request.headers)}:${questionHash}`, actorUserId: userId });
      if (!duplicate.allowed) return NextResponse.json({ code: "duplicate_request" }, { status: 429, headers: { "Retry-After": String(duplicate.retryAfter), "Cache-Control": "no-store" } });
    }
  }
  const isProtected = request.nextUrl.pathname.startsWith("/dashboard");
  const isAuthPage = ["/login", "/signup"].includes(request.nextUrl.pathname);

  if (!authenticated && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "auth_required");
    return NextResponse.redirect(url);
  }
  if (authenticated && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
