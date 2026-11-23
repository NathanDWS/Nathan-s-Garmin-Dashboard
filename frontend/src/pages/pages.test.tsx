import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../lib/api";
import { emptyBundle, fixtureBundle, profile } from "../test-fixtures";
import Vandaag from "./Vandaag";
import Doelen from "./Doelen";
import Coach from "./Coach";
import Herstel from "./Herstel";
import Slaap from "./Slaap";

vi.mock("../lib/api", async (orig) => {
  const mod: any = await orig();
  return { ...mod, getInsights: vi.fn(), getGoals: vi.fn(), putGoals: vi.fn(), chat: vi.fn(), getPrompt: vi.fn(), resetChat: vi.fn() };
});

// recharts needs a sized container; jsdom has none
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = RO;

const props = (data = fixtureBundle()) => ({
  data, profile, now: new Date(2026, 10, 23), go: vi.fn(), period: "30d" as const, setPeriod: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getInsights).mockResolvedValue([]);
  vi.mocked(api.getGoals).mockResolvedValue({ hardlopen_km: 20, fietsen_km: 60, zwemmen_km: 0, kracht_sessies: 2, stappen_per_dag: 10000 });
});

describe("Vandaag", () => {
  it("renders readiness tile", async () => {
    render(<Vandaag {...props()} />);
    expect(screen.getByText("Trainingsgereedheid")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getAllByText("Duurloop")).toHaveLength(5);
  });

  it("renders empty state", () => {
    render(<Vandaag {...props(emptyBundle())} />);
    expect(screen.getByText(/Nog geen data/)).toBeInTheDocument();
  });

  it("shows insight cards", async () => {
    vi.mocked(api.getInsights).mockResolvedValue([{ title: "Stress hoger dan normaal", detail: "45%", severity: "let_op", metric: "s", date: "2026-11-22" }]);
    render(<Vandaag {...props()} />);
    expect(await screen.findByText("Stress hoger dan normaal")).toBeInTheDocument();
  });
});

describe("Doelen", () => {
  it("saves goals", async () => {
    vi.mocked(api.putGoals).mockImplementation(async (_id, g) => g);
    render(<Doelen {...props()} />);
    const input = await screen.findByLabelText("Hardlopen (km per week)");
    await userEvent.clear(input);
    await userEvent.type(input, "30");
    await userEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    expect(api.putGoals).toHaveBeenCalledWith("papa", expect.objectContaining({ hardlopen_km: 30 }));
  });
});

describe("Coach", () => {
  it("shows key missing message on 503", async () => {
    vi.mocked(api.chat).mockRejectedValue(new api.ApiError(503, { error: "Geen Claude API-key ingesteld. Zet ANTHROPIC_API_KEY in .env." }));
    render(<Coach {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: "Hoe is mijn herstel deze week?" }));
    expect(await screen.findByText(/Geen Claude API-key ingesteld/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopieer prompt" })).toBeEnabled();
  });

  it("copy prompt writes clipboard", async () => {
    vi.mocked(api.getPrompt).mockResolvedValue({ text: "mijn prompt" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Coach {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: "Kopieer prompt" }));
    expect(writeText).toHaveBeenCalledWith("mijn prompt");
    expect(await screen.findByText(/Gekopieerd/)).toBeInTheDocument();
  });

  it("shows reply", async () => {
    vi.mocked(api.chat).mockResolvedValue({ reply: "Je herstel is **goed**." });
    render(<Coach {...props()} />);
    await userEvent.type(screen.getByLabelText("Bericht aan de coach"), "hoe gaat het{Enter}");
    expect(await screen.findByText("goed")).toBeInTheDocument();
  });
});

describe("Herstel", () => {
  it("hides blood pressure when there is none", () => {
    render(<Herstel {...props()} />);
    expect(screen.getByText("Rusthartslag")).toBeInTheDocument();
    expect(screen.queryByText("Bloeddruk")).toBeNull();
  });
});

describe("month filter", () => {
  it("Slaap shows only the chosen month", () => {
    render(<Slaap {...props()} period={"m:2026-10" as any} />);
    expect(screen.getAllByText("oktober 2026").filter((e) => e.tagName !== "OPTION")).toHaveLength(1);
    expect(screen.getByLabelText("Kies maand")).toHaveValue("m:2026-10");
  });

  it("choosing a month in the list sets the period", async () => {
    const p = props();
    render(<Slaap {...p} />);
    await userEvent.selectOptions(screen.getByLabelText("Kies maand"), "m:2026-10");
    expect(p.setPeriod).toHaveBeenCalledWith("m:2026-10");
  });
});
