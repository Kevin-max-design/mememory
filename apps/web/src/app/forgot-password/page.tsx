import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { requestPasswordReset } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/errors";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const notice = authErrorMessage(error);
  return (
    <AuthShell
      description="Enter the email connected to your account. We will send a secure recovery link if the account exists."
      footer={<Link className="text-sm font-semibold text-teal-800 hover:text-teal-900" href="/login">← Return to sign in</Link>}
      title="Reset your password"
    >
      {notice ? (
        <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {notice}
        </p>
      ) : null}
      {message === "sent" ? (
        <p className="mt-6 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900" role="status">
          If that email is registered, a password recovery link has been sent.
        </p>
      ) : null}
      <form action={requestPasswordReset} className="mt-7 space-y-5">
        <label className="block text-sm font-semibold text-slate-700">
          Email
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-50"
            name="email"
            required
            type="email"
          />
        </label>
        <button className="w-full rounded-xl bg-teal-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-teal-800" type="submit">
          Send recovery link
        </button>
      </form>
    </AuthShell>
  );
}
