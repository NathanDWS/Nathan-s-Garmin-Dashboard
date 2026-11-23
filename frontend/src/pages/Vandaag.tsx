import { useEffect, useMemo, useState } from "react";
import type { PageProps } from "../App";
import EmptyState from "../components/EmptyState";
import { Card, Delta, PageHeader, Stat } from "../components/ui";
import { getInsights } from "../lib/api";
import { SPORT_META, SPORT_ORDER, addDays, avgBy, duration, iso, km, lastN, longDate, pace, pctChange, shortDate, speed, sumBy, weekStart } from "../lib/metrics";
import type { Activity, Insight } from "../lib/types";

const LEVEL: Record<string, string> = { HIGH: "Hoog", MODERATE: "Gemiddeld", LOW: "Laag", POOR: "Slecht", PRIME: "Top" };

export default function Vandaag({ data, profile, now, go }: PageProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  useEffect(() => {
    let live = true;
    getInsights(profile.id).then((r) => live && setInsights(r)).catch(() => {});
    return () => { live = false; };
  }, [profile.id, data.last_data_date]);

  const t = useMemo(() => {
    const readiness = data.readiness.at(-1);
    const daily = [...data.daily].reverse().find((d) => d.body_battery_wake != null);
    const sleep = data.sleep.at(-1);
    const hrv30 = avgBy(lastN(data.sleep, 30, now), (s) => s.hrv_overnight);
    const thisWeek = weekStart(now);
    const prevWeek = addDays(thisWeek, -7);
    const dayOfWeek = Math.round((now.getTime() - thisWeek.getTime()) / 864e5);
    const inRange = (a: Activity, from: Date, to: Date) => a.date >= iso(from) && a.date <= iso(to);
    const cur = data.activities.filter((a) => inRange(a, thisWeek, now));
    const prev = data.activities.filter((a) => inRange(a, prevWeek, addDays(prevWeek, dayOfWeek)));
    return { readiness, daily, sleep, hrv30, cur, prev };
  }, [data, now]);

  if (!data.daily.length && !data.sleep.length && !data.activities.length) return <EmptyState />;

  const { readiness, daily, sleep, hrv30, cur, prev } = t;
  const hrvDiff = sleep?.hrv_overnight != null && hrv30 ? sleep.hrv_overnight - hrv30 : null;
  const sports = SPORT_ORDER.filter((s) => cur.some((a) => a.sport === s) || prev.some((a) => a.sport === s));
  const recent = [...data.activities].reverse().slice(0, 5);

  return (
    <div>
      <PageHeader title={`Hoi ${profile.name}`} subtitle={data.last_data_date ? `Laatste data: ${longDate(data.last_data_date)}` : undefined} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Trainingsgereedheid" value={readiness?.score ?? "–"}
          hint={readiness?.level ? LEVEL[readiness.level] ?? readiness.level : "Niet gemeten"}
          tone={readiness?.score == null ? undefined : readiness.score >= 70 ? "good" : readiness.score >= 40 ? "warn" : "bad"} />
        <Stat label="Body Battery bij opstaan" value={daily?.body_battery_wake ?? "–"} hint={daily ? shortDate(daily.date) : undefined} />
        <Stat label="Slaapscore vannacht" value={sleep?.score ?? "–"} hint={sleep?.total_s ? duration(sleep.total_s) + " geslapen" : undefined}
          tone={sleep?.score == null ? undefined : sleep.score >= 75 ? "good" : sleep.score >= 60 ? "warn" : "bad"} />
        <Stat label="HRV vannacht" value={sleep?.hrv_overnight != null ? Math.round(sleep.hrv_overnight) : "–"} unit="ms"
          hint={hrvDiff != null ? `${hrvDiff >= 0 ? "+" : ""}${Math.round(hrvDiff)} t.o.v. 30 dagen` : undefined}
          tone={hrvDiff == null ? undefined : hrvDiff >= -3 ? "good" : "warn"} />
      </div>

      {insights.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Wat opvalt</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {insights.map((i) => (
              <div key={i.metric} className="card p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className={i.severity === "let_op" ? "text-warn" : "text-accent"} aria-hidden>{i.severity === "let_op" ? "▲" : "●"}</span>
                  {i.title}
                </div>
                <p className="mt-1.5 text-sm text-muted">{i.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card title="Deze week" subtitle="Vergeleken met vorige week tot dezelfde dag" className="lg:col-span-3">
          {sports.length === 0 ? <p className="text-sm text-muted">Nog geen trainingen deze week.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="pb-2 font-normal">Sport</th><th className="pb-2 text-right font-normal">Sessies</th><th className="pb-2 text-right font-normal">Afstand</th><th className="pb-2 text-right font-normal">Tijd</th><th className="pb-2 text-right font-normal">vs vorige</th></tr>
              </thead>
              <tbody>
                {sports.map((s) => {
                  const c = cur.filter((a) => a.sport === s), p = prev.filter((a) => a.sport === s);
                  const ct = sumBy(c, (a) => a.duration_s), pt = sumBy(p, (a) => a.duration_s);
                  return (
                    <tr key={s} className="border-t border-line">
                      <td className="py-2.5"><span className="mr-2">{SPORT_META[s].icon}</span>{SPORT_META[s].label}</td>
                      <td className="py-2.5 text-right tabular-nums">{c.length}</td>
                      <td className="py-2.5 text-right tabular-nums">{SPORT_META[s].distance ? `${km(sumBy(c, (a) => a.distance_m))} km` : "–"}</td>
                      <td className="py-2.5 text-right tabular-nums">{duration(ct)}</td>
                      <td className="py-2.5 text-right text-xs"><Delta pct={pctChange(ct, pt)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Laatste trainingen" className="lg:col-span-2" right={<button onClick={() => go("/trainingen")} className="text-xs text-accent hover:underline">Alles</button>}>
          {recent.length === 0 ? <p className="text-sm text-muted">Nog geen trainingen.</p> : (
            <ul className="-mx-2">
              {recent.map((a) => <ActivityRow key={a.id} a={a} onClick={() => go(`/training/${a.id}`)} />)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function ActivityRow({ a, onClick }: { a: Activity; onClick: () => void }) {
  const m = SPORT_META[a.sport];
  const detail = m.paceStyle === "pace" && a.distance_m ? `${pace(a.distance_m, a.moving_s ?? a.duration_s)} /km`
    : m.paceStyle === "speed" && a.distance_m ? `${speed(a.distance_m, a.moving_s ?? a.duration_s)} km/u` : null;
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-base">{m.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{a.name || m.label}</span>
          <span className="block text-xs text-muted">{shortDate(a.date)} · {duration(a.duration_s)}{a.distance_m ? ` · ${km(a.distance_m)} km` : ""}</span>
        </span>
        {detail && <span className="text-xs tabular-nums text-muted">{detail}</span>}
      </button>
    </li>
  );
}
