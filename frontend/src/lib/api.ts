import type { Bundle, Goals, Insight, LoginResponse, Profile, TrackPoint } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.message || body?.error || `HTTP ${status}`);
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init.body ? { "content-type": "application/json", ...(init.headers || {}) } : init.headers,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const p = (id: string) => `/api/profiles/${encodeURIComponent(id)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export type AddProfileBody = { name: string; email: string; password: string; remember_password: boolean };

export const listProfiles = () => call<Profile[]>("/api/profiles");
export const addProfile = (b: AddProfileBody) => call<LoginResponse>("/api/profiles", json("POST", b));
export const submitMfa = (loginId: string, code: string) =>
  call<LoginResponse>("/api/profiles/mfa", json("POST", { login_id: loginId, code }));
export const reconnect = (id: string, b: { password: string; remember_password: boolean }) =>
  call<LoginResponse>(`${p(id)}/reconnect`, json("POST", b));
export const deleteProfile = (id: string) => call<null>(p(id), { method: "DELETE" });
export const startSync = (id: string) => call<{ status: string }>(`${p(id)}/sync`, { method: "POST" });
export const getBundle = (id: string) => call<Bundle>(`${p(id)}/bundle`, {});
export const getTrack = (id: string, aid: number) => call<TrackPoint[]>(`${p(id)}/activities/${aid}/track`);
export const getInsights = (id: string) => call<Insight[]>(`${p(id)}/insights`);
export const getGoals = (id: string) => call<Goals>(`${p(id)}/goals`);
export const putGoals = (id: string, g: Goals) => call<Goals>(`${p(id)}/goals`, json("PUT", g));
export const chat = (id: string, sessionId: string, message: string) =>
  call<{ reply: string }>(`${p(id)}/chat`, json("POST", { session_id: sessionId, message }));
export const resetChat = (id: string, sessionId: string) =>
  call<null>(`${p(id)}/chat/reset`, json("POST", { session_id: sessionId }));
export const getPrompt = (id: string) => call<{ text: string }>(`${p(id)}/prompt`);
