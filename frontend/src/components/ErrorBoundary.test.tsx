import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Boom({ msg }: { msg: string }): never { throw new Error(msg); }

describe("ErrorBoundary", () => {
  it("reloads once on a stale chunk", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    sessionStorage.clear();
    render(<ErrorBoundary reload={reload}><Boom msg="Failed to fetch dynamically imported module: /assets/x.js" /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows a message for other errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary reload={() => {}}><Boom msg="kapot" /></ErrorBoundary>);
    expect(screen.getByText("Er ging iets mis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opnieuw laden" })).toBeInTheDocument();
  });
});
