import { redirect } from "next/navigation";
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
    <main className="mx-auto min-h-screen max-w-md px-6 py-20">
      <p className="text-sm font-semibold tracking-widest text-teal-700">MEDMEMORY</p>
      <h1 className="mt-8 text-3xl font-semibold">Choose a new password</h1>
      <p className="mt-3 text-slate-600">Use at least 12 characters.</p>
      {notice ? (
        <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {notice}
        </p>
      ) : null}
      <form action={resetPassword} className="mt-8 space-y-5">
        <label className="block text-sm font-medium">
          New password
          <input
            autoComplete="new-password"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
        </label>
        <label className="block text-sm font-medium">
          Confirm new password
          <input
            autoComplete="new-password"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            maxLength={128}
            minLength={12}
            name="confirmPassword"
            required
            type="password"
          />
        </label>
        <button className="w-full rounded-lg bg-teal-800 px-4 py-3 font-semibold text-white" type="submit">
          Update password
        </button>
      </form>
    </main>
  );
}
