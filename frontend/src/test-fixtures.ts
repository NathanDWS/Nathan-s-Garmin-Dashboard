import type { Bundle, Profile } from "./lib/types";

export const emptyBundle = (): Bundle => ({
  daily: [], sleep: [], activities: [], weigh_ins: [], readiness: [], training_status: [], vo2max: [],
  blood_pressure: [], last_data_date: null,
});

export const profile: Profile = {
  id: "papa", name: "Papa", email: "p@x.nl", color: "#2563eb", created_at: "", has_saved_password: false,
  last_data_date: "2026-11-23",
  sync: { state: "ok", started_at: null, finished_at: null, last_success: null, message: null },
};

export function fixtureBundle(): Bundle {
  const b = emptyBundle();
  for (let i = 40; i >= 0; i--) {
    const d = new Date(2026, 10, 23 - i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    b.daily.push({ date, steps: 9000, distance_m: 7000, active_kcal: 500, resting_hr: 52, stress_avg: 25,
      body_battery_high: 90, body_battery_low: 20, body_battery_wake: 78, spo2_avg: 96, spo2_low: 90,
      moderate_min: 20, vigorous_min: 10, floors: 5 });
    b.sleep.push({ date, total_s: 27000, deep_s: 5400, light_s: 14400, rem_s: 6000, awake_s: 1200, score: 81,
      hrv_overnight: 60, respiration_avg: 14, spo2_avg: 96 });
    b.readiness.push({ date, score: 72, level: "MODERATE", recovery_time_min: 300 });
    if (i % 2 === 0) {
      b.activities.push({ id: 1000 + i, date, start: `${date}T07:00:00+00:00`, type: "running", sport: "hardlopen",
        indoor: false, name: "Duurloop", duration_s: 3000, moving_s: 2950, distance_m: 10000, avg_speed: 3.3,
        avg_hr: 145, max_hr: 170, kcal: 600, avg_power: null, hr_zones: [300, 1200, 900, 500, 100] });
    }
  }
  b.last_data_date = "2026-11-23";
  return b;
}
