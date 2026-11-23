export const NAV = [
  { path: "/", label: "Vandaag", icon: "◐" },
  { path: "/trainingen", label: "Trainingen", icon: "↗" },
  { path: "/slaap", label: "Slaap", icon: "☾" },
  { path: "/herstel", label: "Herstel", icon: "♡" },
  { path: "/lichaam", label: "Lichaam", icon: "◎" },
  { path: "/doelen", label: "Doelen", icon: "◇" },
  { path: "/coach", label: "Coach", icon: "✦" },
];

export function isActive(route: string, path: string) {
  if (path === "/") return route === "/";
  return route === path || route.startsWith(path + "/") || (path === "/trainingen" && route.startsWith("/training/"));
}

export default function Nav({ route, go }: { route: string; go: (p: string) => void }) {
  return (
    <>
      <nav aria-label="Hoofdmenu" className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="mb-7 flex items-center gap-2.5 px-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-ink text-sm text-bg">⌚</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Gezondheid</div>
            <div className="text-xs text-muted">&amp; training</div>
          </div>
        </div>
        <ul className="space-y-0.5">
          {NAV.map((n) => {
            const on = isActive(route, n.path);
            return (
              <li key={n.path}>
                <a
                  href={`#${n.path}`}
                  onClick={(e) => { e.preventDefault(); go(n.path); }}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-9 items-center gap-3 rounded-xl px-2.5 text-sm transition ${on ? "bg-surface-2 font-medium text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
                >
                  <span className="w-4 text-center text-[15px]">{n.icon}</span>
                  {n.label}
                </a>
              </li>
            );
          })}
        </ul>
        <p className="mt-auto px-2.5 text-[11px] leading-relaxed text-faint">Lokaal op deze computer. Geen medisch advies.</p>
      </nav>

      <nav aria-label="Hoofdmenu mobiel" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-7">
          {NAV.map((n) => {
            const on = isActive(route, n.path);
            return (
              <li key={n.path}>
                <a
                  href={`#${n.path}`}
                  onClick={(e) => { e.preventDefault(); go(n.path); }}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] ${on ? "font-medium text-ink" : "text-muted"}`}
                >
                  <span className="text-base leading-none">{n.icon}</span>
                  {n.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
