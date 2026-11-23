import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { PageProps } from "../App";
import { Button, PageHeader } from "../components/ui";
import { ApiError, chat, getPrompt, resetChat } from "../lib/api";

type Msg = { role: "user" | "assistant" | "error"; text: string };

const STARTERS = [
  "Hoe is mijn herstel deze week?",
  "Hoe gaat mijn hardlopen vergeleken met vorige maand?",
  "Wat valt op aan mijn slaap?",
];

function sessionId(pid: string) {
  const key = `coach-sessie-${pid}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(key, id);
  }
  return id;
}

/** Tiny, safe markdown: paragraphs, bullet lists, **bold**. No HTML injection. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>)}</ul>;
        }
        const h = b.match(/^#{1,4}\s+(.*)$/);
        if (h) return <p key={i} className="font-semibold">{inline(h[1])}</p>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}

export default function Coach({ profile }: PageProps) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sid = sessionId(profile.id);

  useEffect(() => { setMsgs([]); }, [profile.id]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const { reply } = await chat(profile.id, sid, q);
      setMsgs((m) => [...m, { role: "assistant", text: reply }]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.body?.error ?? e.message : "De coach is niet bereikbaar.";
      setMsgs((m) => [...m, { role: "error", text: msg }]);
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    try {
      const { text } = await getPrompt(profile.id);
      await navigator.clipboard.writeText(text);
      setToast("Gekopieerd — plak in je eigen AI-chat");
    } catch {
      setToast("Kopiëren lukte niet");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function reset() {
    await resetChat(profile.id, sid).catch(() => {});
    setMsgs([]);
  }

  const submit = (e: FormEvent) => { e.preventDefault(); send(input); };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col">
      <PageHeader
        title="Coach"
        subtitle={`Vraag Claude alles over de data van ${profile.name}`}
        right={
          <div className="flex gap-2">
            <Button onClick={copyPrompt}>Kopieer prompt</Button>
            {msgs.length > 0 && <Button onClick={reset}>Nieuw gesprek</Button>}
          </div>
        }
      />

      <div className="card flex flex-1 flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {msgs.length === 0 && (
            <div className="grid h-full place-items-center py-10 text-center">
              <div>
                <div className="mb-2 text-2xl">✦</div>
                <p className="mb-5 text-sm text-muted">Begin met een vraag, of kies er een:</p>
                <div className="flex flex-col items-center gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface-2">{s}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "bg-ink text-bg" : m.role === "error" ? "bg-bad/10 text-bad" : "bg-surface-2"}`}>
                {m.role === "assistant" ? <Markdown text={m.text} /> : m.text}
              </div>
            </div>
          ))}
          {busy && <div className="flex"><div className="rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-muted">Denkt na…</div></div>}
          <div ref={endRef} />
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
          <label htmlFor="coach-input" className="sr-only">Bericht aan de coach</label>
          <input id="coach-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Stel een vraag…"
            className="h-10 flex-1 rounded-xl bg-surface-2 px-3 text-sm outline-none placeholder:text-faint" />
          <Button type="submit" variant="primary" disabled={busy || !input.trim()}>Stuur</Button>
        </form>
      </div>
      <p className="mt-3 text-center text-xs text-faint">Geen medisch advies. De coach vergelijkt met je eigen gemiddelden.</p>
      {toast && <div role="status" className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-bg shadow-lg lg:bottom-8">{toast}</div>}
    </div>
  );
}
