import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddAccountDialog from "./AddAccountDialog";
import * as api from "../lib/api";

vi.mock("../lib/api", async (orig) => {
  const mod: any = await orig();
  return { ...mod, addProfile: vi.fn(), submitMfa: vi.fn(), reconnect: vi.fn() };
});

const profile = { id: "papa", name: "Papa", email: "p@x.nl", color: "#000", created_at: "", has_saved_password: false, last_data_date: null, sync: { state: "idle" } } as any;

async function fill() {
  await userEvent.type(screen.getByLabelText("Naam"), "Papa");
  await userEvent.type(screen.getByLabelText("Garmin-e-mail"), "p@x.nl");
  await userEvent.type(screen.getByLabelText("Wachtwoord"), "geheim");
  await userEvent.click(screen.getByRole("button", { name: "Verbinden" }));
}

describe("AddAccountDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("remember checkbox off by default", () => {
    render(<AddAccountDialog mode="add" onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /Wachtwoord onthouden/ })).not.toBeChecked();
    expect(screen.getByText(/Anders bewaren we alleen een login-token/)).toBeInTheDocument();
  });

  it("submits then shows MFA step and finishes", async () => {
    vi.mocked(api.addProfile).mockResolvedValue({ status: "needs_mfa", login_id: "L1" });
    vi.mocked(api.submitMfa).mockResolvedValue({ status: "ok", profile });
    const onDone = vi.fn();
    render(<AddAccountDialog mode="add" onClose={() => {}} onDone={onDone} />);
    await fill();
    expect(api.addProfile).toHaveBeenCalledWith({ name: "Papa", email: "p@x.nl", password: "geheim", remember_password: false });
    await userEvent.type(await screen.findByLabelText("Code uit je e-mail of sms"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    expect(api.submitMfa).toHaveBeenCalledWith("L1", "123456");
    expect(await screen.findByText(/Account toegevoegd/)).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledWith("papa");
  });

  it("shows bad credentials error", async () => {
    vi.mocked(api.addProfile).mockRejectedValue(new api.ApiError(400, { status: "bad_credentials" }));
    render(<AddAccountDialog mode="add" onClose={() => {}} onDone={() => {}} />);
    await fill();
    expect(await screen.findByText("E-mail of wachtwoord klopt niet")).toBeInTheDocument();
  });

  it("shows rate limit error", async () => {
    vi.mocked(api.addProfile).mockRejectedValue(new api.ApiError(429, { status: "rate_limited" }));
    render(<AddAccountDialog mode="add" onClose={() => {}} onDone={() => {}} />);
    await fill();
    expect(await screen.findByText(/Garmin blokkeert tijdelijk/)).toBeInTheDocument();
  });

  it("reconnect mode asks only for the password", async () => {
    vi.mocked(api.reconnect).mockResolvedValue({ status: "ok", profile });
    render(<AddAccountDialog mode="reconnect" profile={profile} onClose={() => {}} onDone={() => {}} />);
    expect(screen.queryByLabelText("Naam")).toBeNull();
    await userEvent.type(screen.getByLabelText("Wachtwoord"), "geheim");
    await userEvent.click(screen.getByRole("button", { name: "Verbinden" }));
    expect(api.reconnect).toHaveBeenCalledWith("papa", { password: "geheim", remember_password: false });
  });
});
