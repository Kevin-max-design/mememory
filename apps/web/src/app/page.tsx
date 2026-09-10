import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-sm font-semibold tracking-widest text-teal-700">
        MEDMEMORY
      </p>
      <h1 className="mt-5 text-5xl font-semibold tracking-tight">
        Your health history.
        <br />
        Kept together.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-slate-600">
        A private archive for your medical records, with every extracted fact
        linked to its original source.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          className="rounded-lg bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900"
          href="/signup"
        >
          Create account
        </Link>
        <Link
          className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-teal-900 hover:bg-slate-50"
          href="/login"
        >
          Sign in
        </Link>
      </div>
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Private by default</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your archive is protected by account and database access controls.
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Source linked</h2>
          <p className="mt-2 text-sm text-slate-600">
            Extracted facts will retain their original document evidence.
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">You stay in control</h2>
          <p className="mt-2 text-sm text-slate-600">
            Review workflows and document uploads are the next release gate.
          </p>
        </article>
      </section>
    </main>
  );
}
