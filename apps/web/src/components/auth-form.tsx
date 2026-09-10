import Link from "next/link";
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
    message === "check_email"
      ? "Check your email to confirm your account, then sign in."
      : message === "signed_out"
        ? "You have been signed out."
        : undefined;

  return (
    <main className="mx-auto min-h-screen max-w-md px-6 py-20">
      <Link
        className="text-sm font-semibold tracking-widest text-teal-700"
        href="/"
      >
        MEDMEMORY
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">
        {isSignup ? "Create your private archive" : "Welcome back"}
      </h1>
      <p className="mt-3 text-slate-600">
        {isSignup
          ? "Use an email you control. Important extracted details always require review."
          : "Sign in to access your medical record archive."}
      </p>
      {notice ? (
        <p
          className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {notice}
        </p>
      ) : null}
      {status ? (
        <p
          className="mt-6 rounded-lg bg-teal-50 p-3 text-sm text-teal-900"
          role="status"
        >
          {status}
        </p>
      ) : null}
      <form action={action} className="mt-8 space-y-5">
        {isSignup ? (
          <label className="block text-sm font-medium">
            Full name
            <input
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              name="fullName"
              required
              maxLength={200}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
        </label>
        <button
          className="w-full rounded-lg bg-teal-800 px-4 py-3 font-semibold text-white hover:bg-teal-900"
          type="submit"
        >
          {isSignup ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        {isSignup ? "Already have an account?" : "New to MedMemory?"}{" "}
        <Link
          className="font-semibold text-teal-800 underline"
          href={isSignup ? "/login" : "/signup"}
        >
          {isSignup ? "Sign in" : "Create one"}
        </Link>
      </p>
    </main>
  );
}
