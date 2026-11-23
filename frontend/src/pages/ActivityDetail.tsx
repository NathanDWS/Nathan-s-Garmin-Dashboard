import { useEffect, useState } from "react";
import type { PageProps } from "../App";
import { ProportionBar } from "../components/charts";
import RouteMap from "../components/RouteMap";
import { Button, Card, PageHeader } from "../components/ui";
import { getTrack } from "../lib/api";
import { SPORT_META, duration, fmt, km, longDate, pace, speed } from "../lib/metrics";
import type { TrackPoint } from "../lib/types";

// HR zones: same blue ramp, light → dark (sequential, one hue).
const ZONE_COLORS = ["#b7d3f5", "#7fb0ec", "#4a8fe0", "#2a78d6", "#1a4f93"];

export default function ActivityDetail({ data, profile, go, activityId }: PageProps & { activityId: number }) {
  const a = data.activities.find((x) => x.id === activityId);
  const [track, setTrack] = useState<TrackPoint[] | null>(null);

  useEffect(() => {
    setTrack(null);
    if (a && !a.indoor) getTrack(profile.id, a.id).then(setTrack).catch(() => setTrack([]));
    else setTrack([]);
  }, [profile.id, a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) {
    return (
      <div className="card p-8 text-center">
        <p className="mb-4 text-sm text-muted">Deze training staat niet (meer) in de data van {profile.name}.</p>
        <Button onClick={() => go("/trainingen")}>Naar trainingen</Button>
      </div>
    );
  }

  const m = SPORT_META[a.sport];
  const moving = a.moving_s ?? a.duration_s;
  const stats: [string, string][] = [
    ["Duur", duration(a.duration_s)],
    ...(a.distance_m ? [["Afstand", `${km(a.distance_m)} km`] as [string, string]] : []),
    ...(m.paceStyle === "pace" && a.distance_m ? [["Tempo", `${pace(a.distance_m, moving)} /km`] as [string, string]] : []),
    ...(m.paceStyle === "speed" && a.distance_m ? [["Snelheid", `${speed(a.distance_m, moving)} km/u`] as [string, string]] : []),
    ...(a.avg_hr ? [["Gem. hartslag", `${fmt(a.avg_hr)} bpm`] as [string, string]] : []),
    ...(a.max_hr ? [["Max. hartslag", `${fmt(a.max_hr)} bpm`] as [string, string]] : []),
    ...(a.kcal ? [["Calorieën", `${fmt(a.kcal)} kcal`] as [string, string]] : []),
    ...(a.avg_power ? [["Gem. vermogen", `${fmt(a.avg_power)} W`] as [string, string]] : []),
  ];

  return (
    <div>
      <button onClick={() => go("/trainingen")} className="mb-3 text-sm text-muted hover:text-ink">← Trainingen</button>
      <PageHeader title={a.name || m.label} subtitle={<>{m.icon} {m.label} · {longDate(a.date)}{a.indoor ? " · binnen" : ""}</>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-1.5 text-lg font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {track && track.length > 1 && (
          <Card title="Route" className="lg:col-span-2">
            <RouteMap points={track} color={profile.color} />
          </Card>
        )}
        <Card title="Hartslagzones" subtitle="Tijd per zone" className={track && track.length > 1 ? "" : "lg:col-span-3"}>
          <ProportionBar parts={a.hr_zones.map((v, i) => ({ label: `Zone ${i + 1}`, value: v, color: ZONE_COLORS[i] }))} />
          <ul className="mt-5 space-y-1.5 text-sm">
            {a.hr_zones.map((v, i) => (
              <li key={i} className="flex justify-between"><span className="text-muted">Zone {i + 1}</span><span className="tabular-nums">{duration(v)}</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
