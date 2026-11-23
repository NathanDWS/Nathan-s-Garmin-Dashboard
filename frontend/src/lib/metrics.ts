// Period maths and formatting shared by every page (period logic ported from garmin-claude-dashboard).
import type { Sport } from "./types";

/** "m:YYYY-MM" = one chosen calendar month. */
export type PeriodKey = "month" | "30d" | "year" | `m:${string}`;
export type Window = { start: Date; end: Date; label: string };

export const PERIOD_LABELS: Record<"month" | "30d" | "year", string> = { month: "Deze maand", "30d": "30 dagen", year: "Dit jaar" };

const FULL_MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const monthName = (y: number, m: number) => `${FULL_MONTHS[m]} ${y}`;

/** Months (newest first) that appear in the given ISO dates, for the "Kies maand" list. */
export function monthOptions(dates: string[]): { value: PeriodKey; label: string }[] {
  const keys = [...new Set(dates.map((d) => d.slice(0, 7)))].sort().reverse();
  return keys.map((k) => ({ value: `m:${k}` as PeriodKey, label: monthName(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1) }));
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

export function periods(now: Date, key: PeriodKey): { current: Window; prev: Window } {
  const end = endOfDay(now);
  if (key.startsWith("m:")) {
    const y = Number(key.slice(2, 6)), m = Number(key.slice(7, 9)) - 1;
    const monthEnd = new Date(y, m + 1, 0, 23, 59, 59);
    return {
      current: { start: new Date(y, m, 1), end: monthEnd < end ? monthEnd : end, label: monthName(y, m) },
      prev: { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59), label: monthName(new Date(y, m - 1, 1).getFullYear(), (m + 11) % 12) },
    };
  }
  if (key === "30d") {
    return {
      current: { start: startOfDay(addDays(end, -29)), end, label: "Laatste 30 dagen" },
      prev: { start: startOfDay(addDays(end, -59)), end: addDays(end, -30), label: "30 dagen ervoor" },
    };
  }
  if (key === "year") {
    return {
      current: { start: new Date(now.getFullYear(), 0, 1), end, label: `${now.getFullYear()} t/m vandaag` },
      prev: {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59),
        label: `${now.getFullYear() - 1} zelfde periode`,
      },
    };
  }
  const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  return {
    current: { start: new Date(now.getFullYear(), now.getMonth(), 1), end, label: `${MONTHS[now.getMonth()]} t/m vandaag` },
    prev: {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), prevMonthDays), 23, 59, 59),
      label: `${MONTHS[(now.getMonth() + 11) % 12]} zelfde periode`,
    },
  };
}

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function inWindow<T extends { date: string }>(rows: T[], w: Window): T[] {
  const a = iso(w.start), b = iso(w.end);
  return rows.filter((r) => r.date >= a && r.date <= b);
}

export function sumBy<T>(rows: T[], f: (r: T) => number | null | undefined): number {
  return rows.reduce((s, r) => s + (f(r) ?? 0), 0);
}

export function avgBy<T>(rows: T[], f: (r: T) => number | null | undefined): number | null {
  const v = rows.map(f).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function rolling(vals: (number | null)[], window: number): (number | null)[] {
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

export function lastN<T extends { date: string }>(rows: T[], days: number, now: Date): T[] {
  const from = iso(addDays(now, -(days - 1)));
  return rows.filter((r) => r.date >= from);
}

export function weekStart(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // monday = 0
  return startOfDay(addDays(d, -day));
}

export const pctChange = (cur: number | null, prev: number | null) =>
  cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100;

// ---- formatting ------------------------------------------------------------
const nl = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const nl0 = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });

export const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? "–" : (digits ? nl : nl0).format(Number(v.toFixed(digits)));

export const km = (m: number | null | undefined) => (m ? fmt(m / 1000, 1) : "–");

export function duration(s: number | null | undefined): string {
  if (!s) return "–";
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h}u ${String(m).padStart(2, "0")}m` : `${m} min`;
}

export function pace(distanceM: number | null | undefined, seconds: number | null | undefined): string {
  if (!distanceM || !seconds) return "–";
  const secPerKm = seconds / (distanceM / 1000);
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

export const speed = (distanceM: number | null | undefined, seconds: number | null | undefined) =>
  distanceM && seconds ? fmt(distanceM / 1000 / (seconds / 3600), 1) : "–";

export function shortDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}

export function longDate(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
};

export function relativeTime(isoTs: string | null, now = new Date()): string {
  if (!isoTs) return "nooit";
  const mins = Math.round((now.getTime() - new Date(isoTs).getTime()) / 60000);
  if (mins < 1) return "zojuist";
  if (mins < 60) return `${mins} min geleden`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.round(h / 24);
  return d === 1 ? "gisteren" : `${d} dagen geleden`;
}

export const SPORT_META: Record<Sport, { label: string; icon: string; color: string; distance: boolean; paceStyle: "pace" | "speed" | "none" }> = {
  hardlopen: { label: "Hardlopen", icon: "🏃", color: "var(--c-run)", distance: true, paceStyle: "pace" },
  fietsen: { label: "Fietsen", icon: "🚴", color: "var(--c-bike)", distance: true, paceStyle: "speed" },
  zwemmen: { label: "Zwemmen", icon: "🏊", color: "var(--c-swim)", distance: true, paceStyle: "pace" },
  kracht: { label: "Kracht", icon: "🏋️", color: "var(--c-strength)", distance: false, paceStyle: "none" },
  wandelen: { label: "Wandelen", icon: "🚶", color: "var(--c-walk)", distance: true, paceStyle: "pace" },
  overig: { label: "Overig", icon: "✦", color: "var(--c-other)", distance: false, paceStyle: "none" },
};
export const SPORT_ORDER: Sport[] = ["hardlopen", "fietsen", "zwemmen", "kracht", "wandelen", "overig"];
