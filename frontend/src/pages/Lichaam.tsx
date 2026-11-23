import { useEffect, useMemo, useState } from "react";
import type { PageProps } from "../App";
import { BarsChart, TrendChart } from "../components/charts";
import { Card, PageHeader, PeriodSlicer, Stat } from "../components/ui";
import { getGoals } from "../lib/api";
import { addDays, avgBy, fmt, inWindow, iso, lastN, monthLabel, monthOptions, periods, rolling, shortDate, sumBy, weekStart } from "../lib/metrics";

export default function Lichaam({ data, profile, now, period, setPeriod }: PageProps) {
  const { current } = periods(now, period);
  const [stepGoal, setStepGoal] = useState(10000);
  useEffect(() => { getGoals(profile.id).then((g) => setStepGoal(g.stappen_per_dag)).catch(() => {}); }, [profile.id]);

  const steps = useMemo(() => inWindow(data.daily, current).map((d) => ({ date: d.date, steps: d.steps })), [data, current.start.getTime(), current.end.getTime()]);

  const months = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const d of lastN(data.daily, 365, now)) {
      if (d.steps == null) continue;
      const k = d.date.slice(0, 7);
      by.set(k, [...(by.get(k) ?? []), d.steps]);
    }
    return [...by].sort().map(([m, v]) => ({ month: m, steps: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }));
  }, [data, now]);

  const weeks = useMemo(() => {
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const start = addDays(weekStart(now), -7 * i), end = addDays(start, 6);
      const rows = data.daily.filter((d) => d.date >= iso(start) && d.date <= iso(end));
      out.push({ week: iso(start), min: sumBy(rows, (d) => d.moderate_min) + 2 * sumBy(rows, (d) => d.vigorous_min) });
    }
    return out;
  }, [data, now]);

  const weight = useMemo(() => {
    const w = data.weigh_ins.filter((r) => r.weight_kg != null);
    const avg = rolling(w.map((r) => r.weight_kg), 5);
    return w.map((r, i) => ({ ...r, weight_avg: avg[i] }));
  }, [data]);

  const week = lastN(data.daily, 7, now);
  const lastW = weight.at(-1);

  return (
    <div>
      <PageHeader title="Lichaam" subtitle="Gewicht, stappen en beweging" right={<PeriodSlicer value={period} onChange={setPeriod} months={monthOptions(data.daily.map((d) => d.date))} />} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stappen (gem. 7 d)" value={fmt(avgBy(week, (d) => d.steps))} hint={`doel ${fmt(stepGoal)}`} />
        <Stat label="Intensiteitsminuten deze week" value={fmt(weeks.at(-1)?.min ?? 0)} hint="doel 150 per week" tone={(weeks.at(-1)?.min ?? 0) >= 150 ? "good" : undefined} />
        <Stat label="Gewicht" value={lastW ? fmt(lastW.weight_kg, 1) : "–"} unit={lastW ? "kg" : undefined} hint={lastW ? shortDate(lastW.date) : "geen weegschaal"} />
        <Stat label="Vetpercentage" value={lastW?.body_fat_pct != null ? fmt(lastW.body_fat_pct, 1) : "–"} unit={lastW?.body_fat_pct != null ? "%" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Stappen per dag" subtitle={current.label} className="lg:col-span-2">
          <BarsChart data={steps} x="date" xFormat={shortDate} series={[{ key: "steps", label: "Stappen", color: "var(--c-series)" }]} reference={{ y: stepGoal, label: "doel" }} />
        </Card>
        <Card title="Gemiddelde stappen per maand">
          <BarsChart data={months} x="month" xFormat={monthLabel} series={[{ key: "steps", label: "Gem. per dag", color: "var(--c-series)" }]} />
        </Card>
        <Card title="Intensiteitsminuten per week" subtitle="Zware minuten tellen dubbel, zoals bij Garmin">
          <BarsChart data={weeks} x="week" xFormat={shortDate} series={[{ key: "min", label: "Minuten", color: "var(--c-series)" }]} reference={{ y: 150, label: "150" }} />
        </Card>
        {weight.length > 0 ? (
          <>
            <Card title="Gewicht" subtitle="Alle wegingen">
              <TrendChart data={weight} value={{ key: "weight_kg", label: "Weging", color: "var(--c-series)", unit: "kg", digits: 1 }} avg={{ key: "weight_avg", label: "Gemiddeld", color: "var(--c-series)", unit: "kg", digits: 1 }} />
            </Card>
            {weight.some((w) => w.body_fat_pct != null) && (
              <Card title="Vetpercentage">
                <TrendChart data={weight} value={{ key: "body_fat_pct", label: "Vet", color: "var(--c-series)", unit: "%", digits: 1 }} />
              </Card>
            )}
          </>
        ) : (
          <Card title="Gewicht">
            <p className="text-sm text-muted">Geen weegschaaldata — weeg je via Garmin Connect of een Index-weegschaal.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
