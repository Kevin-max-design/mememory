import Link from "next/link";
import { UiIcon, type IconName } from "@/components/ui-icons";
import { logout } from "@/features/auth/actions";

export type NavigationKey =
  | "overview"
  | "history"
  | "timeline"
  | "search"
  | "ask"
  | "help"
  | "brief"
  | "emergency";

type NavigationItem = {
  key: NavigationKey;
  href: string;
  label: string;
  icon: IconName;
};

const primary: NavigationItem[] = [
  { key: "overview", href: "/dashboard", label: "Overview", icon: "grid" },
  { key: "history", href: "/records", label: "Medical history", icon: "history" },
  { key: "timeline", href: "/timeline", label: "Timeline", icon: "timeline" },
  { key: "search", href: "/search", label: "Search records", icon: "search" },
];

const tools: NavigationItem[] = [
  { key: "ask", href: "/ask", label: "Ask my records", icon: "message" },
  { key: "brief", href: "/doctor-brief", label: "Doctor brief", icon: "brief" },
  { key: "help", href: "/medical-help", label: "Medical help", icon: "pulse" },
  { key: "emergency", href: "/emergency", label: "Emergency card", icon: "shield" },
];

function NavigationLink({ item, active }: { item: NavigationItem; active: NavigationKey }) {
  const selected = active === item.key;
  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${selected ? "bg-teal-50 text-teal-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
      href={item.href}
    >
      <UiIcon className={`h-[19px] w-[19px] ${selected ? "text-teal-700" : "text-slate-400 group-hover:text-slate-600"}`} name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppShell({ active, title, description, actions, children }: { active: NavigationKey; title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f5f7fa] text-slate-950 lg:flex">
      <aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-slate-200/80 bg-white lg:sticky lg:top-0 lg:flex">
        <Link className="flex items-center gap-3 px-6 py-7" href="/dashboard">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white shadow-sm">
            <UiIcon className="h-5 w-5" name="heart" />
          </span>
          <span>
            <span className="block text-[17px] font-bold tracking-tight text-slate-950">MedMemory</span>
            <span className="block text-[11px] font-medium text-slate-400">Private health archive</span>
          </span>
        </Link>

        <div className="px-4">
          <Link className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800" href="/dashboard#upload">
            <UiIcon className="h-4 w-4" name="upload" />
            Upload record
          </Link>
        </div>

        <nav aria-label="Main navigation" className="mt-7 px-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <div className="mt-2 space-y-1">
            {primary.map((item) => <NavigationLink active={active} item={item} key={item.key} />)}
          </div>
          <p className="mt-7 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Tools</p>
          <div className="mt-2 space-y-1">
            {tools.map((item) => <NavigationLink active={active} item={item} key={item.key} />)}
          </div>
        </nav>

        <div className="mt-auto border-t border-slate-100 p-4">
          <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" href="/dashboard#privacy">
            <UiIcon className="h-[19px] w-[19px] text-slate-400" name="shield" />
            Privacy & data
          </Link>
          <form action={logout}>
            <button className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" type="submit">
              <UiIcon className="h-[19px] w-[19px] text-slate-400" name="logout" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <Link className="flex items-center gap-2.5 font-bold text-slate-950" href="/dashboard">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700 text-white"><UiIcon className="h-4 w-4" name="heart" /></span>
              MedMemory
            </Link>
            <Link className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white" href="/dashboard#upload">
              <UiIcon className="h-3.5 w-3.5" name="upload" />
              Upload
            </Link>
          </div>
          <nav aria-label="Main navigation" className="hide-scrollbar flex gap-1 overflow-x-auto px-3 pb-3">
            {[...primary, ...tools].map((item) => (
              <Link aria-current={active === item.key ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${active === item.key ? "bg-teal-50 text-teal-800" : "text-slate-500"}`} href={item.href} key={item.key}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-7 lg:px-10 lg:py-9 xl:px-12">
          <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-7 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-950 sm:text-[32px] sm:leading-tight">{title}</h1>
              {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">{description}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </header>
          {children}
        </div>
      </div>
    </main>
  );
}
