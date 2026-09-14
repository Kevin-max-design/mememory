"use server";

import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/features/audit/server";
import { logServerEvent } from "@/features/observability/logger";
import { createClient } from "@/lib/supabase/server";
import { credentialsSchema, signupSchema } from "./schemas";

export async function login(formData: FormData) {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=invalid_input");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logServerEvent({ event: "auth.login_failed", route: "/login", errorCode: "INVALID_CREDENTIALS", environment: process.env.NODE_ENV });
    await recordAuditEvent({ actorUserId: null, action: "auth.login_failed", resourceType: "session", status: "failed", metadata: { error_code: "INVALID_CREDENTIALS", source_route: "/login" } });
    redirect("/login?error=invalid_credentials");
  }
  await recordAuditEvent({ actorUserId: data.user.id, action: "auth.login_succeeded", resourceType: "session", status: "succeeded", metadata: { source_route: "/login" } });
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) redirect("/signup?error=invalid_input");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });
  if (error) {
    logServerEvent({ event: "auth.signup_failed", route: "/signup", errorCode: "SIGNUP_FAILED", environment: process.env.NODE_ENV });
    await recordAuditEvent({ actorUserId: null, action: "auth.signup_failed", resourceType: "user", status: "failed", metadata: { error_code: "SIGNUP_FAILED", source_route: "/signup" } });
    redirect("/signup?error=signup_failed");
  }
  await recordAuditEvent({ actorUserId: data.user?.id ?? null, action: "auth.signup_succeeded", resourceType: "user", resourceId: data.user?.id, status: "succeeded", metadata: { source_route: "/signup" } });
  if (data.session) redirect("/dashboard");
  redirect("/login?message=check_email");
}

export async function logout() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    logServerEvent({ event: "auth.logout_failed", route: "/logout", errorCode: "SIGNOUT_FAILED", environment: process.env.NODE_ENV });
    await recordAuditEvent({ actorUserId: auth.user?.id ?? null, action: "auth.logout_failed", resourceType: "session", status: "failed", metadata: { error_code: "SIGNOUT_FAILED", source_route: "/logout" } });
    redirect("/dashboard?error=signout_failed");
  }
  await recordAuditEvent({ actorUserId: auth.user?.id ?? null, action: "auth.logout_succeeded", resourceType: "session", status: "succeeded", metadata: { source_route: "/logout" } });
  redirect("/login?message=signed_out");
}
