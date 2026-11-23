import { useMemo } from "react";
import type { PageProps } from "../App";
import { RangeChart, TrendChart } from "../components/charts";
import { Card, PageHeader, PeriodSlicer, Stat } from "../components/ui";
import { avgBy, fmt, inWindow, lastN, monthOptions, periods, rolling } from "../lib/metrics";

export default function Herstel({ data, now, period, setPeriod }: PageProps) {
  const { current } = periods(now, period);
  const rows = useMemo(() => {
    const daily = inWindow(data.daily, current);
    const sleepBy = new Map(inWindow(data.sleep, current).map((s) => [s.date, s]));
    const dates = [...new Set([...daily.map((d) => d.date), ...sleepBy.keys()])].sort();
    const dailyBy = new Map(daily.map((d) => [d.date, d]));
    const base = dates.map((date) => {
      const d = dailyBy.get(date), s = sleepBy.get(date);
      return {
        date, rhr: d?.resting_hr ?? null, hrv: s?.hrv_overnight ?? null, stress: d?.stress_avg ?? null,
        bbHigh: d?.body_battery_high ?? null, bbLow: d?.body_battery_low ?? null,
        resp: s?.respiration_avg ?? null, spo2: d?.spo2_avg ?? s?.spo2_avg ?? null,
      };
    });
    const withAvg = (k: keyof (typeof base)[number]) => rolling(base.map((r) => r[k] as number | null), 7);
    const avg = Object.fromEntries((["rhr", "hrv", "stress", "resp", "spo2"] as const).map((k) => [k, withAvg(k)]));
    return base.map((r, i) => ({ ...r, rhr7: avg.rhr[i], hrv7: avg.hrv[i], stress7: avg.stress[i], resp7: avg.resp[i], spo27: avg.spo2[i] }));
  }, [data, current.start.getTime(), current.end.getTime()]);

  const months = monthOptions(data.daily.map((d) => d.date));
  const bp = lastN(data.blood_pressure, 180, now);
  const has = (k: "spo2" | "resp" | "hrv" | "stress") => rows.some((r) => r[k] != null);
  const last7 = rows.slice(-7), prev = rows.slice(0, -7);
  const tile = (k: "rhr" | "hrv") => ({ now: avgBy(last7, (r) => r[k]), base: avgBy(prev, (r) => r[k]) });
  const rhr = tile("rhr"), hrv = tile("hrv");

  return (
    <div>
      <PageHeader title="Herstel" subtitle={`${current.label} · lijn = 7-dagen gemiddelde`} right={<PeriodSlicer value={period} onChange={setPeriod} months={months} />} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Rusthartslag (7 d)" value={fmt(rhr.now)} unit="bpm" hint={rhr.base ? `gemiddeld ${fmt(rhr.base)} daarvoor` : undefined}
          tone={rhr.now && rhr.base ? (rhr.now - rhr.base > 3 ? "warn" : "good") : undefined} />
        <Stat label="HRV (7 d)" value={fmt(hrv.now)} unit="ms" hint={hrv.base ? `gemiddeld ${fmt(hrv.base)} daarvoor` : undefined}
          tone={hrv.now && hrv.base ? (hrv.base - hrv.now > 5 ? "warn" : "good") : undefined} />
        <Stat label="Stress (7 d)" value={fmt(avgBy(last7, (r) => r.stress))} unit="%" />
        <Stat label="Body Battery hoogste (7 d)" value={fmt(avgBy(last7, (r) => r.bbHigh))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Rusthartslag" subtitle="Lager is meestal beter uitgerust">
          <TrendChart data={rows} value={{ key: "rhr", label: "Per dag", color: "var(--c-series)", unit: "bpm" }} avg={{ key: "rhr7", label: "7 dagen", color: "var(--c-series)", unit: "bpm" }} />
        </Card>
        {has("hrv") && (
          <Card title="HRV vannacht" subtitle="Hoger dan je gemiddelde = goed hersteld">
            <TrendChart data={rows} value={{ key: "hrv", label: "Per nacht", color: "var(--c-series)", unit: "ms" }} avg={{ key: "hrv7", label: "7 dagen", color: "var(--c-series)", unit: "ms" }} />
          </Card>
        )}
        <Card title="Body Battery" subtitle="Hoogste en laagste stand per dag">
          <RangeChart data={rows} high={{ key: "bbHigh", label: "Hoogste", color: "var(--c-series)" }} low={{ key: "bbLow", label: "Laagste", color: "var(--c-series-2)" }} />
        </Card>
        {has("stress") && (
          <Card title="Stress" subtitle="Gemiddeld per dag">
            <TrendChart data={rows} value={{ key: "stress", label: "Per dag", color: "var(--c-series)", unit: "%" }} avg={{ key: "stress7", label: "7 dagen", color: "var(--c-series)", unit: "%" }} />
          </Card>
        )}
        {has("resp") && (
          <Card title="Ademhaling" subtitle="Gemiddeld tijdens de slaap">
            <TrendChart data={rows} value={{ key: "resp", label: "Per nacht", color: "var(--c-series)", unit: "/min", digits: 1 }} avg={{ key: "resp7", label: "7 dagen", color: "var(--c-series)", unit: "/min", digits: 1 }} />
          </Card>
        )}
        {has("spo2") && (
          <Card title="Bloedzuurstof (SpO2)" subtitle="Gemiddeld per dag">
            <TrendChart data={rows} domain={[85, 100]} value={{ key: "spo2", label: "Per dag", color: "var(--c-series)", unit: "%", digits: 1 }} avg={{ key: "spo27", label: "7 dagen", color: "var(--c-series)", unit: "%", digits: 1 }} />
          </Card>
        )}
        {bp.length > 0 && (
          <Card title="Bloeddruk" subtitle="Metingen van de laatste 6 maanden">
            <TrendChart data={bp} value={{ key: "systolic", label: "Bovendruk", color: "var(--c-series)", unit: "mmHg" }} avg={{ key: "diastolic", label: "Onderdruk", color: "var(--c-series-2)", unit: "mmHg" }} pair />
          </Card>
        )}
      </div>
    </div>
  );
}
