import Link from "next/link";

type NavigationKey = "overview" | "history" | "timeline" | "search" | "ask";

const navigation: { key: NavigationKey; href: string; label: string }[] = [
  { key: "overview", href: "/dashboard", label: "Overview" },
  { key: "history", href: "/records", label: "Medical history" },
  { key: "timeline", href: "/timeline", label: "Timeline" },
  { key: "search", href: "/search", label: "Search" },
  { key: "ask", href: "/ask", label: "Ask" },
];

export function AppShell({
  active,
  title,
  description,
  actions,
  children,
}: {
  active: NavigationKey;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f7faf9]">
      <header className="border-b border-slate-200 bg-white/95">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              className="text-lg font-bold tracking-[0.18em] text-teal-700"
              href="/dashboard"
            >
              MEDMEMORY
            </Link>
            <div className="flex items-center gap-3">
              <Link
                className="hidden rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white sm:inline-flex"
                href="/dashboard#upload"
              >
                Add document
              </Link>
              {actions}
            </div>
          </div>
          <nav
            aria-label="Main navigation"
            className="mt-5 flex gap-1 overflow-x-auto pb-1"
          >
            {navigation.map((item) => (
              <Link
                aria-current={active === item.key ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active === item.key ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
                href={item.href}
                key={item.key}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Private health archive
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-3xl text-slate-600">{description}</p>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
