import Link from "next/link";

export type NavigationKey =
  | "overview"
  | "history"
  | "timeline"
  | "search"
  | "ask"
  | "help"
  | "brief"
  | "emergency";

const navigation: {
  key: NavigationKey;
  href: string;
  label: string;
  icon: string;
}[] = [
  { key: "overview", href: "/dashboard", label: "Dashboard", icon: "▦" },
  { key: "timeline", href: "/timeline", label: "Timeline", icon: "◷" },
  { key: "history", href: "/records", label: "Documents", icon: "▤" },
  { key: "search", href: "/search", label: "Search records", icon: "⌕" },
  { key: "ask", href: "/ask", label: "Ask my records", icon: "□" },
  { key: "help", href: "/medical-help", label: "Get medical help", icon: "∿" },
  { key: "brief", href: "/doctor-brief", label: "Doctor brief", icon: "▧" },
  {
    key: "emergency",
    href: "/emergency",
    label: "Emergency summary",
    icon: "◇",
  },
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
    <main className="min-h-screen bg-[#f7f9fc] text-slate-950 lg:flex">
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex">
        <Link
          className="flex items-center gap-3 px-6 py-7 text-xl font-bold tracking-tight text-slate-900"
          href="/dashboard"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-teal-600 text-sm text-teal-700">
            ♥
          </span>
          MedMemory
        </Link>
        <nav aria-label="Main navigation" className="space-y-1 px-4">
          {navigation.map((item) => (
            <Link
              aria-current={active === item.key ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${active === item.key ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
              href={item.href}
              key={item.key}
            >
              <span
                aria-hidden="true"
                className="grid h-6 w-6 place-items-center text-lg text-slate-400"
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-4 border-t border-slate-100 p-4">
          <Link
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
            href="/dashboard#upload"
          >
            <span aria-hidden="true">＋</span> Upload record
          </Link>
          <Link
            className="block rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
            href="/dashboard#privacy"
          >
            Private health archive
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Profile & privacy settings
            </span>
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white lg:hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <Link className="font-bold text-teal-800" href="/dashboard">
              ♥ MedMemory
            </Link>
            <div className="flex items-center gap-2">
              <Link
                className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white"
                href="/dashboard#upload"
              >
                Upload
              </Link>
            </div>
          </div>
          <nav
            aria-label="Main navigation"
            className="flex gap-1 overflow-x-auto px-4 pb-3"
          >
            {navigation.map((item) => (
              <Link
                aria-current={active === item.key ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${active === item.key ? "bg-teal-50 text-teal-800" : "text-slate-600"}`}
                href={item.href}
                key={item.key}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-2 max-w-3xl text-slate-600">{description}</p>
              ) : null}
            </div>
            <div className="hidden items-center gap-3 lg:flex">{actions}</div>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
