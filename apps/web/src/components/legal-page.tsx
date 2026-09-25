import { PublicShell } from "@/components/public-shell";

export function LegalPage({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <PublicShell>
      <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          {title}
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Last updated September 25, 2026
        </p>
        <div className="legal-copy mt-10">{children}</div>
      </main>
    </PublicShell>
  );
}
