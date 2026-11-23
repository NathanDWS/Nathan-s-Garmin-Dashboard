import { useState, type FormEvent } from "react";
import { ApiError, addProfile, reconnect, submitMfa } from "../lib/api";
import type { LoginResponse, Profile } from "../lib/types";
import { Button, Field, Modal, inputCls } from "./ui";

type Props =
  | { mode: "add"; profile?: undefined; onClose: () => void; onDone: (id: string) => void }
  | { mode: "reconnect"; profile: Profile; onClose: () => void; onDone: (id: string) => void };

const ERRORS: Record<string, string> = {
  bad_credentials: "E-mail of wachtwoord klopt niet",
  rate_limited: "Garmin blokkeert tijdelijk, probeer het over een uur opnieuw",
};

export default function AddAccountDialog({ mode, profile, onClose, onDone }: Props) {
  const [step, setStep] = useState<"form" | "mfa" | "done">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState("");
  const [loginId, setLoginId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<LoginResponse>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res.status === "needs_mfa") {
        setLoginId(res.login_id);
        setStep("mfa");
      } else {
        setPassword("");
        setStep("done");
        onDone(res.profile.id);
      }
    } catch (e) {
      const status = e instanceof ApiError ? e.body?.status : null;
      setError(ERRORS[status] ?? (e instanceof ApiError && e.body?.message) ?? "Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    run(() => mode === "add"
      ? addProfile({ name: name.trim(), email: email.trim(), password, remember_password: remember })
      : reconnect(profile.id, { password, remember_password: remember }));
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    run(() => submitMfa(loginId, code.trim()));
  };

  const title = mode === "add" ? "Account toevoegen" : `Opnieuw verbinden: ${profile.name}`;

  return (
    <Modal title={title} onClose={onClose}>
      {step === "form" && (
        <form onSubmit={submitForm}>
          {mode === "add" && (
            <>
              <Field label="Naam">
                {(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Papa" required autoFocus />}
              </Field>
              <Field label="Garmin-e-mail">
                {(id) => <input id={id} type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />}
              </Field>
            </>
          )}
          {mode === "reconnect" && <p className="mb-4 text-sm text-muted">{profile.email}</p>}
          <Field label="Wachtwoord">
            {(id) => <input id={id} type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required autoFocus={mode === "reconnect"} />}
          </Field>
          <label className="mb-1 flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Wachtwoord onthouden voor automatisch opnieuw inloggen</span>
          </label>
          <p className="mb-5 pl-6.5 text-xs text-muted">Anders bewaren we alleen een login-token.</p>
          {error && <p role="alert" className="mb-4 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>Annuleren</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? "Bezig…" : "Verbinden"}</Button>
          </div>
          <p className="mt-5 text-[11px] leading-relaxed text-faint">
            Je gegevens gaan alleen naar Garmin Connect. Dit gebruikt een onofficiële koppeling; Garmin kan die op elk moment wijzigen.
          </p>
        </form>
      )}

      {step === "mfa" && (
        <form onSubmit={submitCode}>
          <p className="mb-4 text-sm text-muted">Garmin heeft je een verificatiecode gestuurd.</p>
          <Field label="Code uit je e-mail of sms">
            {(id) => <input id={id} className={`${inputCls} tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />}
          </Field>
          {error && <p role="alert" className="mb-4 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>Annuleren</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? "Bezig…" : "Bevestigen"}</Button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div>
          <p className="mb-5 text-sm">
            {mode === "add" ? "Account toegevoegd — we halen het afgelopen jaar op. Dat kan even duren." : "Verbonden — we halen de nieuwste data op."}
          </p>
          <div className="flex justify-end"><Button variant="primary" onClick={onClose}>Klaar</Button></div>
        </div>
      )}
    </Modal>
  );
}
