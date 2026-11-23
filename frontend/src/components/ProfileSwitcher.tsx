import { useEffect, useRef, useState } from "react";
import { deleteProfile } from "../lib/api";
import { useProfiles } from "../lib/profile-context";
import type { Profile } from "../lib/types";
import { Button, Modal } from "./ui";

export default function ProfileSwitcher({ onAdd }: { onAdd: () => void }) {
  const { profiles, active, setActive, refresh } = useProfiles();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!active) return null;

  async function remove(p: Profile) {
    setBusy(true);
    try {
      await deleteProfile(p.id);
      await refresh();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface pl-2.5 pr-3 text-sm font-medium hover:bg-surface-2"
      >
        <Avatar p={active} />
        {active.name}
        <span className="text-faint">▾</span>
      </button>
      {open && (
        <div role="menu" className="card absolute left-0 top-11 z-[900] w-64 p-1.5">
          {profiles.map((p) => (
            <div key={p.id} className="group flex items-center rounded-lg hover:bg-surface-2">
              <button
                role="menuitemradio"
                aria-checked={p.id === active.id}
                onClick={() => { setActive(p.id); setOpen(false); }}
                className="flex flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm"
              >
                <Avatar p={p} />
                <span className="flex-1 truncate">{p.name}</span>
                {p.id === active.id && <span className="text-accent">✓</span>}
              </button>
              <button
                aria-label={`${p.name} verwijderen`}
                onClick={() => { setConfirm(p); setOpen(false); }}
                className="mr-1 hidden h-7 w-7 place-items-center rounded-md text-faint hover:bg-surface hover:text-bad group-hover:grid"
              >
                🗑
              </button>
            </div>
          ))}
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" onClick={() => { setOpen(false); onAdd(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-accent hover:bg-surface-2">
            <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-accent text-xs">+</span>
            Account toevoegen
          </button>
        </div>
      )}
      {confirm && (
        <Modal title="Profiel verwijderen?" onClose={() => setConfirm(null)}>
          <p className="mb-5 text-sm text-muted">
            Alle opgehaalde data en de Garmin-koppeling van <strong className="text-ink">{confirm.name}</strong> worden van deze computer verwijderd. Je Garmin-account zelf blijft gewoon bestaan.
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirm(null)}>Annuleren</Button>
            <Button variant="danger" disabled={busy} onClick={() => remove(confirm)}>Verwijderen</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Avatar({ p, size = 24 }: { p: Pick<Profile, "name" | "color">; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: p.color, width: size, height: size }}>
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
