import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { authErrorMessage } from "@/features/auth/errors";

type AuthFormProps = {
  action: (formData: FormData) => Promise<void>;
  error?: string;
  mode: "login" | "signup";
  message?: string;
};

export function AuthForm({ action, error, mode, message }: AuthFormProps) {
  const isSignup = mode === "signup";
  const notice = authErrorMessage(error);
  const status =
    message === "signed_out"
      ? "You have been signed out."
      : message === "password_updated"
        ? "Your password was updated. Sign in with the new password."
        : undefined;

  return (
    <AuthShell
      description={isSignup ? "Create a private place for your records. You decide which extracted facts become part of your history." : "Sign in to continue to your private health workspace."}
      footer={
        <p className="text-sm text-slate-500">
          {isSignup ? "Already have an account?" : "New to MedMemory?"}{" "}
          <Link className="font-semibold text-teal-800 hover:text-teal-900" href={isSignup ? "/login" : "/signup"}>
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      }
      title={isSignup ? "Create your private archive" : "Welcome back"}
    >
      {notice ? (
        <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {notice}
        </p>
      ) : null}
      {status ? (
        <p className="mt-6 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900" role="status">
          {status}
        </p>
      ) : null}
      <form action={action} className="mt-7 space-y-5">
        {isSignup ? (
          <label className="block text-sm font-semibold text-slate-700">
            Full name
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-50"
              name="fullName"
              required
              maxLength={200}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label className="block text-sm font-semibold text-slate-700">
          Email
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-50"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          <span className="flex items-center justify-between gap-4">
            Password
            {!isSignup ? <Link className="text-xs font-semibold text-teal-800 hover:text-teal-900" href="/forgot-password">Forgot password?</Link> : null}
          </span>
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-50"
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
        </label>
        {isSignup ? (
          <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <input
              className="mt-1 h-4 w-4 rounded border-slate-300 accent-teal-800"
              name="acceptedTerms"
              required
              type="checkbox"
            />
            <span>
              I agree to the{" "}
              <Link
                className="font-semibold text-teal-800 underline"
                href="/terms"
              >
                Terms
              </Link>{" "}
              and acknowledge the{" "}
              <Link
                className="font-semibold text-teal-800 underline"
                href="/privacy"
              >
                Privacy Policy
              </Link>
              . I understand that MedMemory is AI-assisted and does not provide
              medical advice.
            </span>
          </label>
        ) : null}
        <button className="w-full rounded-xl bg-teal-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-teal-800" type="submit">
          {isSignup ? "Create account" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
