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
      <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Foundation setup in progress</h2>
        <p className="mt-2 text-slate-600">
          Patient accounts, uploads, and medical record processing are not
          available yet.
        </p>
      </section>
    </main>
  );
}
