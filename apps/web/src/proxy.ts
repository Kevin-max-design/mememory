import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/signup",
    "/auth/confirm",
    "/api/documents",
    "/api/privacy/:path*",
    "/search",
    "/ask",
    "/records/:path*",
    "/timeline",
  ],
};
