import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  allAccounts,
  onSessionExpired,
  setCredential,
} from "../../frontend/lib/api";

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "http://localhost" } });
  setCredential("google-id-token");
});
afterEach(() => {
  vi.unstubAllGlobals();
  setCredential(null);
  onSessionExpired(() => {});
});

describe("dashboard API client", () => {
  it("uses existing bearer auth, typed JSON, account scope, and no cookies", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    await expect(
      api("/collections/id/items/item", {
        method: "PATCH",
        query: { actAs: "account", filters: undefined },
        body: { values: [{ field_id: "field", value: false }] },
      }),
    ).resolves.toBeUndefined();
    const [url, init] = request.mock.calls[0]!;
    expect(url.toString()).toBe("http://localhost/api/collections/id/items/item?actAs=account");
    expect(init).toMatchObject({
      method: "PATCH",
      credentials: "omit",
      headers: { Authorization: "Bearer google-id-token", "Content-Type": "application/json" },
    });
    expect(JSON.parse(init.body).values[0].value).toBe(false);
  });
  it("surfaces API validation details and expires the session on 401", async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            { error: "Validation failed", details: [{ path: "name", message: "Required" }] },
            { status: 400 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({ error: "Invalid Google ID token" }, { status: 401 }),
        ),
    );
    await expect(api("/collections")).rejects.toThrow("name: Required");
    expect(expired).not.toHaveBeenCalled();
    await expect(api("/users/me")).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
  });
  it("does not let a stale response expire a new session", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      ),
    );
    const expired = vi.fn();
    onSessionExpired(expired);
    const request = api("/users/me");
    setCredential("new-token");
    finish(Response.json({ error: "expired" }, { status: 401 }));
    await expect(request).rejects.toThrow("session changed");
    expect(expired).not.toHaveBeenCalled();
  });
  it("loads paginated account suggestions instead of silently truncating them", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ users: [{ id: "a" }], page: { has_more: true } }))
      .mockResolvedValueOnce(Response.json({ users: [{ id: "b" }], page: { has_more: false } }));
    vi.stubGlobal("fetch", request);
    expect(await allAccounts()).toEqual([{ id: "a" }, { id: "b" }]);
    expect(request.mock.calls[1]![0].searchParams.get("offset")).toBe("100");
  });
});
