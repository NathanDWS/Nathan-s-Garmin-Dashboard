import { relativeTime, shortDate } from "../lib/metrics";
import type { SyncStatus } from "../lib/types";

export default function SyncBadge({ status, lastDataDate, onReconnect }: {
  status: SyncStatus; lastDataDate: string | null; onReconnect: () => void;
}) {
  const dot = (cls: string) => <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
  const wrap = "inline-flex items-center gap-2 text-xs";

  switch (status.state) {
    case "running":
      return (
        <span className={`${wrap} text-muted`}>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />
          <span>Bezig met ophalen…{lastDataDate ? ` (t/m ${shortDate(lastDataDate)})` : ""}</span>
        </span>
      );
    case "needs_reconnect":
      return (
        <span className={`${wrap} text-warn`}>
          {dot("bg-warn")}
          <span>Verbinding verlopen</span>
          <button onClick={onReconnect} className="font-medium underline underline-offset-2 hover:opacity-80">Opnieuw verbinden</button>
        </span>
      );
    case "rate_limited":
      return <span className={`${wrap} text-warn`}>{dot("bg-warn")}<span>Garmin vraagt even geduld — later opnieuw</span></span>;
    case "error":
      return <span className={`${wrap} text-bad`}>{dot("bg-bad")}<span title={status.message ?? ""}>Ophalen mislukt</span></span>;
    case "ok":
      return <span className={`${wrap} text-muted`}>{dot("bg-good")}<span>Bijgewerkt {relativeTime(status.last_success)}</span></span>;
    default:
      return lastDataDate
        ? <span className={`${wrap} text-muted`}>{dot("bg-faint")}<span>Data t/m {shortDate(lastDataDate)}</span></span>
        : null;
  }
}
