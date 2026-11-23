import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SyncBadge from "./SyncBadge";

const base = { started_at: null, finished_at: null, last_success: null, message: null };

describe("SyncBadge", () => {
  it("shows reconnect banner", async () => {
    const onReconnect = vi.fn();
    render(<SyncBadge status={{ ...base, state: "needs_reconnect" }} lastDataDate={null} onReconnect={onReconnect} />);
    expect(screen.getByText("Verbinding verlopen")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Opnieuw verbinden" }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it("shows progress while running", () => {
    render(<SyncBadge status={{ ...base, state: "running" }} lastDataDate="2026-03-04" onReconnect={() => {}} />);
    expect(screen.getByText(/Bezig met ophalen/)).toHaveTextContent("t/m 4 mrt");
  });

  it("shows rate limit and error states", () => {
    const { rerender } = render(<SyncBadge status={{ ...base, state: "rate_limited" }} lastDataDate={null} onReconnect={() => {}} />);
    expect(screen.getByText(/Garmin vraagt even geduld/)).toBeInTheDocument();
    rerender(<SyncBadge status={{ ...base, state: "error", message: "boem" }} lastDataDate={null} onReconnect={() => {}} />);
    expect(screen.getByText("Ophalen mislukt")).toHaveAttribute("title", "boem");
  });

  it("shows last update when ok", () => {
    const ts = new Date(Date.now() - 5 * 60000).toISOString();
    render(<SyncBadge status={{ ...base, state: "ok", last_success: ts }} lastDataDate={null} onReconnect={() => {}} />);
    expect(screen.getByText(/Bijgewerkt 5 min geleden/)).toBeInTheDocument();
  });
});
