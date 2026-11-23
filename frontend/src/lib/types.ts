// Mirrors backend/dashboard/bundle.py and api.py field names exactly.

export type Sport = "hardlopen" | "fietsen" | "zwemmen" | "kracht" | "wandelen" | "overig";

export type SyncState = "idle" | "running" | "ok" | "needs_reconnect" | "rate_limited" | "error";

export type SyncStatus = {
  state: SyncState;
  started_at: string | null;
  finished_at: string | null;
  last_success: string | null;
  message: string | null;
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  color: string;
  created_at: string;
  has_saved_password: boolean;
  last_data_date: string | null;
  sync: SyncStatus;
};

export type Daily = {
  date: string;
  steps: number | null;
  distance_m: number | null;
  active_kcal: number | null;
  resting_hr: number | null;
  stress_avg: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  body_battery_wake: number | null;
  spo2_avg: number | null;
  spo2_low: number | null;
  moderate_min: number | null;
  vigorous_min: number | null;
  floors: number | null;
};

export type Sleep = {
  date: string;
  total_s: number | null;
  deep_s: number | null;
  light_s: number | null;
  rem_s: number | null;
  awake_s: number | null;
  score: number | null;
  hrv_overnight: number | null;
  respiration_avg: number | null;
  spo2_avg: number | null;
};

export type Activity = {
  id: number;
  date: string;
  start: string;
  type: string | null;
  sport: Sport;
  indoor: boolean;
  name: string | null;
  duration_s: number | null;
  moving_s: number | null;
  distance_m: number | null;
  avg_speed: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  kcal: number | null;
  avg_power: number | null;
  hr_zones: number[];
};

export type WeighIn = { date: string; weight_kg: number | null; body_fat_pct: number | null; muscle_kg: number | null; bmi: number | null };
export type Readiness = { date: string; score: number | null; level: string | null; recovery_time_min: number | null };
export type TrainingStatus = { date: string; status: string | null; acute_load: number | null; chronic_load: number | null; acwr: number | null };
export type Vo2 = { date: string; value: number; sport: Sport };
export type BloodPressure = { date: string; systolic: number | null; diastolic: number | null; pulse: number | null };

export type Bundle = {
  daily: Daily[];
  sleep: Sleep[];
  activities: Activity[];
  weigh_ins: WeighIn[];
  readiness: Readiness[];
  training_status: TrainingStatus[];
  vo2max: Vo2[];
  blood_pressure: BloodPressure[];
  last_data_date: string | null;
};

export type Insight = { title: string; detail: string; severity: "info" | "let_op"; metric: string; date: string };

export type Goals = {
  hardlopen_km: number;
  fietsen_km: number;
  zwemmen_km: number;
  kracht_sessies: number;
  stappen_per_dag: number;
};

export type TrackPoint = { lat: number; lon: number; hr: number | null; t: string };

export type LoginResponse =
  | { status: "ok"; profile: Profile }
  | { status: "needs_mfa"; login_id: string };
