import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link
          className="text-sm font-bold tracking-[0.2em] text-teal-800"
          href="/"
        >
          MEDMEMORY
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          <Link
            className="hidden font-medium text-slate-600 hover:text-teal-800 sm:inline"
            href="/how-it-works"
          >
            How it works
          </Link>
          <Link
            className="font-medium text-slate-600 hover:text-teal-800"
            href="/login"
          >
            Sign in
          </Link>
          <Link
            className="rounded-lg bg-teal-800 px-4 py-2 font-semibold text-white hover:bg-teal-900"
            href="/signup"
          >
            Create account
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 text-sm text-slate-600 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="font-semibold text-slate-900">MedMemory</p>
          <p className="mt-2 max-w-xl">
            AI-assisted organization of medical records. MedMemory does not
            provide medical advice, diagnosis, treatment, or emergency services.
          </p>
        </div>
        <nav
          aria-label="Legal and support"
          className="flex flex-wrap content-start gap-x-5 gap-y-3"
        >
          <Link className="hover:text-teal-800" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-teal-800" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-teal-800" href="/support">
            Support
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
