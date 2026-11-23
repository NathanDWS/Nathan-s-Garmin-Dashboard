import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { PERIOD_LABELS, type PeriodKey } from "../lib/metrics";

export function Card({ title, subtitle, right, children, className = "" }: {
  title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, hint, tone, accent }: {
  label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: "good" | "warn" | "bad"; accent?: string;
}) {
  const toneCls = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-muted";
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[28px] font-semibold leading-none tracking-tight">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {hint && <div className={`mt-2 text-xs ${toneCls}`}>{hint}</div>}
    </div>
  );
}

export function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="text-faint">–</span>;
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <span className={Math.abs(pct) < 1 ? "text-muted" : good ? "text-good" : "text-bad"}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };
export function Button({ variant = "ghost", className = "", ...rest }: BtnProps) {
  const v = variant === "primary"
    ? "bg-ink text-bg hover:opacity-90"
    : variant === "danger"
      ? "bg-bad text-white hover:opacity-90"
      : "border border-line bg-surface hover:bg-surface-2";
  return (
    <button
      {...rest}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`}
    />
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-[10px] px-3 text-sm transition ${o.value === value ? "bg-surface-2 font-medium text-ink" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PeriodSlicer({ value, onChange }: { value: PeriodKey; onChange: (p: PeriodKey) => void }) {
  return (
    <Segmented
      label="Periode"
      value={value}
      onChange={onChange}
      options={(["month", "30d", "year"] as PeriodKey[]).map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
    />
  );
}

export function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition ${active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-muted hover:text-ink"}`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-md p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = "f-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent";
