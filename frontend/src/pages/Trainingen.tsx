import { useMemo, useState } from "react";
import type { PageProps } from "../App";
import { BarsChart, TrendChart } from "../components/charts";
import { Card, Chip, Delta, PageHeader, PeriodSlicer, Stat } from "../components/ui";
import { SPORT_META, SPORT_ORDER, duration, inWindow, km, monthLabel, pctChange, periods, rolling, shortDate, sumBy } from "../lib/metrics";
import type { Sport } from "../lib/types";
import { ActivityRow } from "./Vandaag";

const STATUS: Record<string, string> = {
  PRODUCTIVE: "Productief", MAINTAINING: "Onderhoud", RECOVERY: "Herstel", UNPRODUCTIVE: "Niet productief",
  OVERREACHING: "Overbelast", DETRAINING: "Conditieverlies", PEAKING: "Piek", STRAINED: "Gespannen",
};

export default function Trainingen({ data, now, go, period, setPeriod }: PageProps) {
  const present = SPORT_ORDER.filter((s) => data.activities.some((a) => a.sport === s));
  const [sport, setSport] = useState<Sport | "alles">("alles");
  const acts = sport === "alles" ? data.activities : data.activities.filter((a) => a.sport === sport);
  const { current, prev } = periods(now, period);
  const cur = inWindow(acts, current), before = inWindow(acts, prev);
  const meta = sport === "alles" ? null : SPORT_META[sport];

  const monthly = useMemo(() => {
    const from = `${now.getFullYear() - 1}-${String(now.getMonth() + 2).padStart(2, "0")}`;
    const by = new Map<string, Record<string, number>>();
    for (const a of data.activities) {
      const m = a.date.slice(0, 7);
      if (m < from) continue;
      const row = by.get(m) ?? {};
      row[a.sport] = (row[a.sport] ?? 0) + (a.duration_s ?? 0) / 3600;
      by.set(m, row);
    }
    return [...by].sort().map(([month, r]) => ({ month, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 10) / 10])) }));
  }, [data, now]);

  const paceRows = useMemo(() => {
    if (!meta || meta.paceStyle === "none") return [];
    const outdoor = acts.filter((a) => !a.indoor && a.distance_m && (a.moving_s ?? a.duration_s)).slice(-60);
    const vals = outdoor.map((a) => {
      const s = (a.moving_s ?? a.duration_s)!;
      return meta.paceStyle === "pace" ? (s / (a.distance_m! / 1000)) / 60 : a.distance_m! / 1000 / (s / 3600);
    });
    const avg = rolling(vals, 5);
    return outdoor.map((a, i) => ({ date: a.date, v: Math.round(vals[i] * 100) / 100, avg: avg[i] }));
  }, [acts, meta]);

  const vo2 = data.vo2max.filter((v) => (sport === "alles" ? v.sport === "hardlopen" : v.sport === sport));
  const status = data.training_status.slice(-90);
  const lastStatus = data.training_status.at(-1);
  const shownSports = sport === "alles" ? present : [sport];

  return (
    <div>
      <PageHeader title="Trainingen" subtitle={`${current.label} · vergeleken met ${prev.label.toLowerCase()}`} right={<PeriodSlicer value={period} onChange={setPeriod} />} />

      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={sport === "alles"} onClick={() => setSport("alles")}>Alles</Chip>
        {present.map((s) => <Chip key={s} active={sport === s} onClick={() => setSport(s)} color={SPORT_META[s].color}>{SPORT_META[s].label}</Chip>)}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sessies" value={cur.length} hint={<Delta pct={pctChange(cur.length, before.length)} />} />
        <Stat label="Tijd" value={duration(sumBy(cur, (a) => a.duration_s))} hint={<Delta pct={pctChange(sumBy(cur, (a) => a.duration_s), sumBy(before, (a) => a.duration_s))} />} />
        <Stat label="Afstand" value={km(sumBy(cur, (a) => a.distance_m))} unit="km" hint={<Delta pct={pctChange(sumBy(cur, (a) => a.distance_m), sumBy(before, (a) => a.distance_m))} />} />
        <Stat label="Trainingsstatus" value={lastStatus?.status ? STATUS[lastStatus.status] ?? lastStatus.status : "–"}
          hint={lastStatus?.acwr != null ? `Belastingsratio ${lastStatus.acwr.toFixed(2)}` : undefined}
          tone={lastStatus?.acwr == null ? undefined : lastStatus.acwr > 1.5 ? "bad" : lastStatus.acwr > 1.3 ? "warn" : "good"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Uren per maand" subtitle="Laatste 12 maanden" className="lg:col-span-2">
          <BarsChart data={monthly} x="month" xFormat={monthLabel} stacked={shownSports.length > 1} height={220}
            series={shownSports.map((s) => ({ key: s, label: SPORT_META[s].label, color: SPORT_META[s].color, unit: "u", digits: 1 }))} />
        </Card>

        {meta && paceRows.length > 1 && (
          <Card title={meta.paceStyle === "pace" ? "Tempo" : "Snelheid"} subtitle={`Buitensessies · ${meta.paceStyle === "pace" ? "min/km, lager is sneller" : "km/u"}`}>
            <TrendChart data={paceRows} value={{ key: "v", label: "Per sessie", color: meta.color, unit: meta.paceStyle === "pace" ? "min/km" : "km/u", digits: 2 }}
              avg={{ key: "avg", label: "Gemiddeld (5)", color: meta.color, unit: meta.paceStyle === "pace" ? "min/km" : "km/u", digits: 2 }} />
          </Card>
        )}

        {vo2.length > 1 && (
          <Card title="VO2max" subtitle={sport === "fietsen" ? "Fietsen" : "Hardlopen"}>
            <TrendChart data={vo2} value={{ key: "value", label: "VO2max", color: "var(--c-series)", digits: 1 }} />
          </Card>
        )}

        {status.length > 1 && (
          <Card title="Trainingsbelasting" subtitle="Acuut (7 dagen) vs chronisch (28 dagen)" className={vo2.length > 1 && meta && paceRows.length > 1 ? "lg:col-span-2" : ""}>
            <TrendChart data={status} value={{ key: "acute_load", label: "Acuut", color: "var(--c-series)" }} avg={{ key: "chronic_load", label: "Chronisch", color: "var(--c-series-2)" }} pair />
          </Card>
        )}

        <Card title="Sessies" subtitle={`${cur.length} in ${current.label.toLowerCase()}`} className="lg:col-span-2">
          {cur.length === 0 ? <p className="text-sm text-muted">Geen trainingen in deze periode.</p> : (
            <ul className="-mx-2 grid gap-x-4 md:grid-cols-2">
              {[...cur].reverse().map((a) => <ActivityRow key={a.id} a={a} onClick={() => go(`/training/${a.id}`)} />)}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-faint">Laatste training: {data.activities.at(-1) ? shortDate(data.activities.at(-1)!.date) : "–"}</p>
    </div>
  );
}
