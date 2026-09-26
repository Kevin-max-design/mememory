import Link from "next/link";
import { UiIcon } from "@/components/ui-icons";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f5f7fa] px-4 py-8 sm:px-6 lg:grid lg:place-items-center lg:py-12">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.32)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
          <Link className="inline-flex items-center gap-2.5" href="/">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white">
              <UiIcon className="h-5 w-5" name="heart" />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-950">MedMemory</span>
          </Link>
          <div className="mt-10">
            <h1 className="text-3xl font-bold tracking-[-0.025em] text-slate-950">{title}</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">{description}</p>
          </div>
          {children}
          {footer ? <div className="mt-7">{footer}</div> : null}
        </section>

        <aside className="hidden bg-teal-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Your records, made useful</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">A clearer medical history, with you in control.</h2>
            <div className="mt-9 space-y-6">
              <TrustPoint title="Review before trust">Extracted facts stay pending until you approve or correct them.</TrustPoint>
              <TrustPoint title="Trace every detail">Open the source document and page behind reviewed information.</TrustPoint>
              <TrustPoint title="Private by default">Your files and health history remain tied to your account.</TrustPoint>
            </div>
          </div>
          <p className="mt-12 text-xs leading-5 text-teal-200">AI-assisted organization only. MedMemory does not provide medical advice or emergency services.</p>
        </aside>
      </div>
    </main>
  );
}

function TrustPoint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-800 text-teal-200">
        <UiIcon className="h-3.5 w-3.5" name="check" />
      </span>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-teal-100/75">{children}</p>
      </div>
    </div>
  );
}
