import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, addProfile, getBundle, startSync } from "./api";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("getBundle hits the profile bundle url", async () => {
    const fn = mockFetch(200, { daily: [] });
    await getBundle("papa");
    expect(fn).toHaveBeenCalledWith("/api/profiles/papa/bundle", expect.anything());
  });

  it("non-2xx throws ApiError with status and body", async () => {
    mockFetch(400, { status: "bad_credentials", message: "E-mail of wachtwoord klopt niet." });
    const err = await addProfile({ name: "a", email: "a@x.nl", password: "x", remember_password: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.body.status).toBe("bad_credentials");
  });

  it("encodes profile ids", async () => {
    const fn = mockFetch(202, { status: "started" });
    await startSync("a b");
    expect(fn).toHaveBeenCalledWith("/api/profiles/a%20b/sync", expect.objectContaining({ method: "POST" }));
  });
});
