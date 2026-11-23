import { useMemo } from "react";
import type { PageProps } from "../App";
import { BarsChart, TrendChart } from "../components/charts";
import { Card, PageHeader, PeriodSlicer, Stat } from "../components/ui";
import EmptyState from "../components/EmptyState";
import { avgBy, duration, inWindow, monthOptions, periods, rolling, shortDate } from "../lib/metrics";
const h = (s: number | null) => (s == null ? null : Math.round((s / 3600) * 100) / 100);

export default function Slaap({ data, now, period, setPeriod }: PageProps) {
  const { current } = periods(now, period);
  const nights = useMemo(() => inWindow(data.sleep, current), [data, current.start.getTime(), current.end.getTime()]);
  const rows = useMemo(() => {
    const avg = rolling(nights.map((n) => n.score), 7);
    return nights.map((n, i) => ({
      date: n.date, score: n.score, score7: avg[i], hours: h(n.total_s),
      deep: h(n.deep_s), rem: h(n.rem_s), light: h(n.light_s), awake: h(n.awake_s),
    }));
  }, [nights]);

  if (!data.sleep.length) return <EmptyState what="slaapdata" />;

  const last = data.sleep.at(-1)!;
  const months = monthOptions(data.sleep.map((s) => s.date));

  return (
    <div>
      <PageHeader title="Slaap" subtitle={current.label} right={<PeriodSlicer value={period} onChange={setPeriod} months={months} />} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Vannacht (${shortDate(last.date)})`} value={duration(last.total_s)} hint={last.score != null ? `Score ${last.score}` : undefined} />
        <Stat label="Gem. slaap per nacht" value={duration(avgBy(nights, (s) => s.total_s))} />
        <Stat label="Gem. score" value={Math.round(avgBy(nights, (s) => s.score) ?? 0) || "–"} />
        <Stat label="Gem. diepe slaap" value={duration(avgBy(nights, (s) => s.deep_s))} />
      </div>
      {!rows.length && <p className="card p-6 text-sm text-muted">Geen slaapdata in deze periode.</p>}
      {rows.length > 0 && <div className="grid gap-4">
        <Card title="Slaapfasen" subtitle="Uren per nacht">
          <BarsChart data={rows} x="date" stacked height={240} xFormat={shortDate}
            series={[
              { key: "deep", label: "Diep", color: "var(--c-sleep-deep)", unit: "u", digits: 1 },
              { key: "rem", label: "REM", color: "var(--c-sleep-rem)", unit: "u", digits: 1 },
              { key: "light", label: "Licht", color: "var(--c-sleep-light)", unit: "u", digits: 1 },
              { key: "awake", label: "Wakker", color: "var(--c-sleep-awake)", unit: "u", digits: 1 },
            ]} />
        </Card>
        {rows.some((r) => r.score != null) && (
          <Card title="Slaapscore">
            <TrendChart data={rows} domain={[0, 100]} value={{ key: "score", label: "Per nacht", color: "var(--c-series)" }} avg={{ key: "score7", label: "7 nachten", color: "var(--c-series)" }} />
          </Card>
        )}
      </div>}
    </div>
  );
}
