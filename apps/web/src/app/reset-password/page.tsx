import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { resetPassword } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/errors";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=confirmation_failed");
  const { error } = await searchParams;
  const notice = authErrorMessage(error);

  return (
    <AuthShell
      description="Choose a strong password with at least 12 characters. You will sign in again after it is updated."
      title="Choose a new password"
    >
      {notice ? (
        <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {notice}
        </p>
      ) : null}
      <form action={resetPassword} className="mt-7 space-y-5">
        <label className="block text-sm font-semibold text-slate-700">
          New password
          <input
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-50"
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Confirm new password
          <input
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-50"
            maxLength={128}
            minLength={12}
            name="confirmPassword"
            required
            type="password"
          />
        </label>
        <button className="w-full rounded-xl bg-teal-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-teal-800" type="submit">
          Update password
        </button>
      </form>
    </AuthShell>
  );
}
