import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getBundle, listProfiles } from "./api";
import type { Bundle, Profile } from "./types";

type Ctx = {
  profiles: Profile[];
  active: Profile | null;
  loaded: boolean;
  setActive: (id: string) => void;
  refresh: () => Promise<Profile[]>;
};

const ProfileCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "profiel";
const POLL_MS = 5000;

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listProfiles();
      setProfiles(list);
      return list;
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const anyRunning = profiles.some((p) => p.sync.state === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => refresh().catch(() => {}), POLL_MS);
    return () => clearInterval(t);
  }, [anyRunning, refresh]);

  const active = useMemo(() => {
    if (!profiles.length) return null;
    return profiles.find((p) => p.id === activeId) ?? profiles.find((p) => p.id !== "demo") ?? profiles[0];
  }, [profiles, activeId]);

  const setActive = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setActiveId(id);
  }, []);

  return <ProfileCtx.Provider value={{ profiles, active, loaded, setActive, refresh }}>{children}</ProfileCtx.Provider>;
}

export function useProfiles(): Ctx {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error("useProfiles outside ProfileProvider");
  return ctx;
}

/** Bundle for the active profile; refetches when its sync finishes or new data arrives. */
export function useBundle(): { data: Bundle | null; loading: boolean; error: string | null } {
  const { active } = useProfiles();
  const [state, setState] = useState<{ id: string | null; data: Bundle | null; error: string | null }>({ id: null, data: null, error: null });
  const key = active ? `${active.id}|${active.sync.state}|${active.last_data_date}` : null;
  const seq = useRef(0);

  useEffect(() => {
    if (!active) return;
    const n = ++seq.current;
    getBundle(active.id)
      .then((data) => n === seq.current && setState({ id: active.id, data, error: null }))
      .catch((e) => n === seq.current && setState({ id: active.id, data: null, error: String(e.message || e) }));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = active && state.id === active.id;
  return { data: fresh ? state.data : null, loading: !!active && !fresh, error: fresh ? state.error : null };
}
