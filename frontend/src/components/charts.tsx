// Thin wrappers around Recharts so every chart shares one look:
// 2px lines, <=24px bars with 4px rounded ends, recessive grid/axes, a hover tooltip.
import type { ReactNode } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmt, shortDate } from "../lib/metrics";

const axis = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;

type Row = Record<string, any>;
export type Series = { key: string; label: string; color: string; unit?: string; digits?: number };

function Tip({ active, payload, label, series, xFormat }: any) {
  if (!active || !payload?.length) return null;
  const rows = (series as Series[]).map((s) => ({ s, v: payload[0].payload[s.key] })).filter((r) => r.v != null);
  if (!rows.length) return null;
  return (
    <div className="card min-w-36 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{xFormat(label)}</div>
      {rows.map(({ s, v }) => (
        <div key={s.key} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="font-medium tabular-nums">{fmt(v, s.digits ?? 0)}{s.unit ? ` ${s.unit}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
        </span>
      ))}
    </div>
  );
}

function Frame({ height, children }: { height: number; children: ReactNode }) {
  return <div style={{ height }} className="-ml-2"><ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer></div>;
}

/** Daily values as faint dots + a 7-day average line. Optional reference (goal / baseline). */
export function TrendChart({ data, x = "date", value, avg, height = 200, reference, domain, xFormat = shortDate, pair = false }: {
  data: Row[]; x?: string; value: Series; avg?: Series; height?: number; reference?: { y: number; label: string };
  /** pair=true: value and avg are two separate measures, both drawn as solid lines. */
  pair?: boolean;
  domain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"]; xFormat?: (v: string) => string;
}) {
  const series = avg ? [value, avg] : [value];
  return (
    <>
      <Legend series={series} />
      <Frame height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey={x} {...axis} tickFormatter={xFormat} minTickGap={28} />
          <YAxis {...axis} width={38} domain={domain ?? ["auto", "auto"]} tickFormatter={(v) => fmt(v, value.digits ? 1 : 0)} allowDecimals={!!value.digits} />
          <Tooltip content={<Tip series={series} xFormat={xFormat} />} cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }} />
          {reference && <ReferenceLine y={reference.y} stroke="var(--faint)" strokeDasharray="4 4" label={{ value: reference.label, position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} />}
          <Line dataKey={value.key} stroke={value.color} strokeOpacity={avg && !pair ? 0.35 : 1} strokeWidth={avg && !pair ? 1.5 : 2}
            dot={avg && !pair ? { r: 2, fill: value.color, strokeWidth: 0, fillOpacity: 0.5 } : false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false} connectNulls />
          {avg && <Line dataKey={avg.key} stroke={avg.color} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} connectNulls strokeLinecap="round" />}
        </ComposedChart>
      </Frame>
    </>
  );
}

/** Two-series range (e.g. body battery high/low) as a soft band + lines. */
export function RangeChart({ data, high, low, height = 200 }: { data: Row[]; high: Series; low: Series; height?: number }) {
  return (
    <>
      <Legend series={[high, low]} />
      <Frame height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={28} />
          <YAxis {...axis} width={38} domain={[0, 100]} />
          <Tooltip content={<Tip series={[high, low]} xFormat={shortDate} />} cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }} />
          <Area dataKey={high.key} stroke={high.color} fill={high.color} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} connectNulls />
          <Line dataKey={low.key} stroke={low.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </Frame>
    </>
  );
}

/** Bars per category/date. stacked=true stacks the series with a 2px surface gap between segments. */
export function BarsChart({ data, x, series, height = 200, stacked = false, xFormat = (v: string) => v, reference, onBarClick }: {
  data: Row[]; x: string; series: Series[]; height?: number; stacked?: boolean; xFormat?: (v: string) => string;
  reference?: { y: number; label: string }; onBarClick?: (row: Row) => void;
}) {
  return (
    <>
      <Legend series={series} />
      <Frame height={height}>
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          {grid}
          <XAxis dataKey={x} {...axis} tickFormatter={xFormat} minTickGap={12} />
          <YAxis {...axis} width={38} tickFormatter={(v) => fmt(v)} />
          <Tooltip content={<Tip series={series} xFormat={xFormat} />} cursor={{ fill: "var(--surface-2)" }} />
          {reference && <ReferenceLine y={reference.y} stroke="var(--faint)" strokeDasharray="4 4" label={{ value: reference.label, position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} stackId={stacked ? "a" : undefined} fill={s.color} maxBarSize={24}
              radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              stroke={stacked ? "var(--surface)" : undefined} strokeWidth={stacked ? 2 : 0}
              isAnimationActive={false} onClick={onBarClick ? (d: any) => onBarClick(d.payload) : undefined}
              cursor={onBarClick ? "pointer" : undefined} />
          ))}
        </BarChart>
      </Frame>
    </>
  );
}

/** Single horizontal proportion bar (e.g. HR zones), each segment labelled below. */
export function ProportionBar({ parts, legend = true }: { parts: { label: string; value: number; color: string }[]; legend?: boolean }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="text-sm text-muted">Geen gegevens.</p>;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} title={`${p.label}: ${Math.round((p.value / total) * 100)}%`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      {legend && <div className="mt-3 grid grid-cols-5 gap-2 text-xs">
        {parts.map((p) => (
          <div key={p.label}>
            <div className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.label}</div>
            <div className="mt-0.5 font-medium tabular-nums">{Math.round((p.value / total) * 100)}%</div>
          </div>
        ))}
      </div>}
    </div>
  );
}

export function Progress({ value, goal, color = "var(--c-series)" }: { value: number; goal: number; color?: string }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : value > 0 ? 100 : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
