import { logout } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/errors";
import { requireUser } from "@/server/auth/require-user";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const notice = authErrorMessage(query.error);
  const { supabase, user } = await requireUser();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("PROFILE_READ_FAILED");

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold tracking-widest text-teal-700">
            MEDMEMORY
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {profile?.full_name
              ? `Welcome, ${profile.full_name}`
              : "Your health archive"}
          </h1>
        </div>
        <form action={logout}>
          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>
      {notice ? (
        <p
          className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {notice}
        </p>
      ) : null}
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold">No documents yet</h2>
        <p className="mt-2 text-slate-600">
          Upload support is being added in the next phase.
        </p>
      </section>
    </main>
  );
}
