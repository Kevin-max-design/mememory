import Link from "next/link";
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
    <main className="mx-auto min-h-screen max-w-md px-6 py-20">
      <Link className="text-sm font-semibold tracking-widest text-teal-700" href="/">
        MEDMEMORY
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">Reset your password</h1>
      <p className="mt-3 text-slate-600">
        Enter your account email. If it is registered, Supabase will send a
        secure recovery link.
      </p>
      {notice ? (
        <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {notice}
        </p>
      ) : null}
      {message === "sent" ? (
        <p className="mt-6 rounded-lg bg-teal-50 p-3 text-sm text-teal-900" role="status">
          If that email is registered, a password recovery link has been sent.
        </p>
      ) : null}
      <form action={requestPasswordReset} className="mt-8 space-y-5">
        <label className="block text-sm font-medium">
          Email
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            name="email"
            required
            type="email"
          />
        </label>
        <button className="w-full rounded-lg bg-teal-800 px-4 py-3 font-semibold text-white" type="submit">
          Send recovery link
        </button>
      </form>
      <Link className="mt-6 inline-block text-sm font-semibold text-teal-800 underline" href="/login">
        Return to sign in
      </Link>
    </main>
  );
}
