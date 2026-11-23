import { lazy, Suspense, useEffect, useState } from "react";
import AddAccountDialog from "./components/AddAccountDialog";
import EmptyState from "./components/EmptyState";
import ErrorBoundary from "./components/ErrorBoundary";
import Nav from "./components/Nav";
import ProfileSwitcher from "./components/ProfileSwitcher";
import SyncBadge from "./components/SyncBadge";
import { Button } from "./components/ui";
import { startSync } from "./lib/api";
import type { PeriodKey } from "./lib/metrics";
import { useBundle, useProfiles } from "./lib/profile-context";
import type { Bundle, Profile } from "./lib/types";
import Vandaag from "./pages/Vandaag";

const Trainingen = lazy(() => import("./pages/Trainingen"));
const ActivityDetail = lazy(() => import("./pages/ActivityDetail"));
const Slaap = lazy(() => import("./pages/Slaap"));
const Herstel = lazy(() => import("./pages/Herstel"));
const Lichaam = lazy(() => import("./pages/Lichaam"));
const Doelen = lazy(() => import("./pages/Doelen"));
const Coach = lazy(() => import("./pages/Coach"));

export type PageProps = { data: Bundle; profile: Profile; now: Date; go: (p: string) => void; period: PeriodKey; setPeriod: (p: PeriodKey) => void };

const normalize = (h: string) => h.replace(/^#/, "") || "/";

function useHashRoute(): [string, (p: string) => void] {
  const [route, setRoute] = useState(() => normalize(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(normalize(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (p) => { window.location.hash = p; window.scrollTo({ top: 0 }); }];
}

/** "now" = the newest day with data, never later than today (so a stale profile still reads sensibly). */
export function dataNow(b: Bundle): Date {
  const today = new Date();
  if (!b.last_data_date) return today;
  const d = new Date(b.last_data_date + "T12:00:00");
  return d > today ? today : d;
}

export default function App() {
  const { profiles, active, loaded, refresh, setActive } = useProfiles();
  const [route, go] = useHashRoute();
  const [dialog, setDialog] = useState<null | "add" | "reconnect">(null);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const { data, error } = useBundle();

  if (!loaded) return <div className="grid h-full place-items-center text-sm text-muted">Laden…</div>;

  const syncing = active?.sync.state === "running";
  const refreshNow = async () => {
    if (!active) return;
    await startSync(active.id).catch(() => {});
    await refresh();
  };

  return (
    <div className="min-h-full">
      <Nav route={route} go={go} />
      <div className="lg:pl-56">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-8">
            <ProfileSwitcher onAdd={() => setDialog("add")} />
            <div className="min-w-0 flex-1 truncate">
              {active && <SyncBadge status={active.sync} lastDataDate={active.last_data_date} onReconnect={() => setDialog("reconnect")} />}
            </div>
            {active && active.id !== "demo" && (
              <Button onClick={refreshNow} disabled={syncing} aria-label="Nu verversen">
                <span className={syncing ? "animate-spin" : ""}>↻</span>
                <span className="hidden sm:inline">Nu verversen</span>
              </Button>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8 lg:pb-12">
          {!profiles.length && <Welcome onAdd={() => setDialog("add")} />}
          {active?.id === "demo" && profiles.length === 1 && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm">
              <span className="text-muted">Je kijkt naar voorbeelddata van een verzonnen sporter.</span>
              <Button variant="primary" onClick={() => setDialog("add")}>Koppel je Garmin</Button>
            </div>
          )}
          {error && <p className="card mb-6 p-4 text-sm text-bad">Kon data niet laden: {error}</p>}
          {active && data && (
            <ErrorBoundary key={route}>
              <Suspense fallback={<div className="py-20 text-center text-sm text-muted">Laden…</div>}>
                {hasAnyData(data) || route === "/coach" || route === "/doelen"
                  ? <Page route={route} props={{ data, profile: active, now: dataNow(data), go, period, setPeriod }} />
                  : <EmptyState syncing={syncing} />}
              </Suspense>
            </ErrorBoundary>
          )}
        </main>
      </div>

      {dialog === "add" && (
        <AddAccountDialog mode="add" onClose={() => setDialog(null)} onDone={async (id) => { await refresh(); setActive(id); }} />
      )}
      {dialog === "reconnect" && active && (
        <AddAccountDialog mode="reconnect" profile={active} onClose={() => setDialog(null)} onDone={() => refresh()} />
      )}
    </div>
  );
}

const hasAnyData = (b: Bundle) => b.daily.length + b.sleep.length + b.activities.length > 0;

function Page({ route, props }: { route: string; props: PageProps }) {
  const m = route.match(/^\/training\/(\d+)$/);
  if (m) return <ActivityDetail {...props} activityId={Number(m[1])} />;
  switch (route) {
    case "/trainingen": return <Trainingen {...props} />;
    case "/slaap": return <Slaap {...props} />;
    case "/herstel": return <Herstel {...props} />;
    case "/lichaam": return <Lichaam {...props} />;
    case "/doelen": return <Doelen {...props} />;
    case "/coach": return <Coach {...props} />;
    default: return <Vandaag {...props} />;
  }
}

function Welcome({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <div className="mb-3 text-3xl">⌚</div>
      <h1 className="text-xl font-semibold">Welkom</h1>
      <p className="mt-2 text-sm text-muted">Koppel je Garmin-account om je gezondheid en trainingen hier te zien.</p>
      <Button variant="primary" className="mt-6" onClick={onAdd}>Account toevoegen</Button>
    </div>
  );
}
