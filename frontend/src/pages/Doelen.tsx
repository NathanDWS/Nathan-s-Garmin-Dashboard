import { useEffect, useState, type FormEvent } from "react";
import type { PageProps } from "../App";
import { Progress } from "../components/charts";
import { Button, Card, Field, PageHeader, inputCls } from "../components/ui";
import { getGoals, putGoals } from "../lib/api";
import { SPORT_META, avgBy, fmt, iso, sumBy, weekStart } from "../lib/metrics";
import type { Goals } from "../lib/types";

const FIELDS: { key: keyof Goals; label: string; step: number }[] = [
  { key: "hardlopen_km", label: "Hardlopen (km per week)", step: 1 },
  { key: "fietsen_km", label: "Fietsen (km per week)", step: 5 },
  { key: "zwemmen_km", label: "Zwemmen (km per week)", step: 0.5 },
  { key: "kracht_sessies", label: "Krachttraining (sessies per week)", step: 1 },
  { key: "stappen_per_dag", label: "Stappen (per dag)", step: 500 },
];

export default function Doelen({ data, profile, now }: PageProps) {
  const [goals, setGoals] = useState<Goals | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getGoals(profile.id).then((g) => {
      setGoals(g);
      setDraft(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, String(v)])));
    }).catch(() => {});
  }, [profile.id]);

  const from = iso(weekStart(now)), to = iso(now);
  const week = data.activities.filter((a) => a.date >= from && a.date <= to);
  const kmOf = (s: keyof typeof SPORT_META) => sumBy(week.filter((a) => a.sport === s), (a) => a.distance_m) / 1000;
  const steps = avgBy(data.daily.filter((d) => d.date >= from && d.date <= to), (d) => d.steps) ?? 0;
  const actual: Record<keyof Goals, number> = {
    hardlopen_km: kmOf("hardlopen"), fietsen_km: kmOf("fietsen"), zwemmen_km: kmOf("zwemmen"),
    kracht_sessies: week.filter((a) => a.sport === "kracht").length, stappen_per_dag: steps,
  };
  const colors: Record<keyof Goals, string> = {
    hardlopen_km: SPORT_META.hardlopen.color, fietsen_km: SPORT_META.fietsen.color, zwemmen_km: SPORT_META.zwemmen.color,
    kracht_sessies: SPORT_META.kracht.color, stappen_per_dag: SPORT_META.wandelen.color,
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const next = Object.fromEntries(FIELDS.map((f) => [f.key, Math.max(0, Number(draft[f.key]) || 0)])) as Goals;
      setGoals(await putGoals(profile.id, next));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Doelen" subtitle="Je weekdoelen, en hoe je er deze week voor staat" />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Deze week" subtitle="Maandag t/m vandaag" className="lg:col-span-3">
          {!goals ? <p className="text-sm text-muted">Laden…</p> : (
            <ul className="space-y-5">
              {FIELDS.filter((f) => goals[f.key] > 0).map((f) => (
                <li key={f.key}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>{f.label.replace(/ \(.*\)/, "")}</span>
                    <span className="tabular-nums text-muted">
                      <span className="font-medium text-ink">{fmt(actual[f.key], f.key.endsWith("_km") ? 1 : 0)}</span> / {fmt(goals[f.key], 1)}
                      {f.key.endsWith("_km") ? " km" : f.key === "kracht_sessies" ? " sessies" : " gem./dag"}
                    </span>
                  </div>
                  <Progress value={actual[f.key]} goal={goals[f.key]} color={colors[f.key]} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Doelen aanpassen" className="lg:col-span-2">
          <form onSubmit={save}>
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                {(id) => <input id={id} type="number" min={0} step={f.step} className={inputCls} value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />}
              </Field>
            ))}
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-good">Opgeslagen</span>}
              <Button type="submit" variant="primary" disabled={busy || !goals}>Opslaan</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
