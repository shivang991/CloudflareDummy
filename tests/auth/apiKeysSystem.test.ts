import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createHarness, env, type Harness } from "../utils/harness";
import { hashApiKey } from "../../src/auth/apiKeys";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
beforeEach(async () => {
  await h.reset();
});
afterAll(async () => {
  await h.pg.close();
});

async function createKey(actor = "alice", name = "Integration") {
  const result = await h.request("/api/api-keys", actor, "POST", { name });
  expect(result.status).toBe(201);
  return result.body as {
    api_key: { id: string; user_id: string; name: string; key_prefix: string };
    key: string;
  };
}

async function request(path: string, key: string, method = "GET", input?: unknown) {
  const headers: Record<string, string> = { "x-api-key": key };
  if (input !== undefined) headers["content-type"] = "application/json";
  const response = await h.app.request(
    path,
    {
      method,
      headers,
      body: input === undefined ? undefined : JSON.stringify(input),
    },
    env,
  );
  return {
    response,
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
}

test("keys are generated once, stored as hashes, and listed only for their owner", async () => {
  const first = await createKey("alice", "  Sync  ");
  const second = await createKey();
  expect(first.key).toMatch(/^crm_[a-f0-9]{64}$/);
  expect(second.key).not.toBe(first.key);
  expect(first.api_key).toMatchObject({
    user_id: h.users.alice.id,
    name: "Sync",
    key_prefix: first.key.slice(0, 16),
  });
  const [stored] = await h.db.query<{ key_hash: string }>(
    "SELECT * FROM crm_api_keys WHERE id = $1",
    [first.api_key.id],
  );
  expect(stored.key_hash).toBe(await hashApiKey(first.key));
  expect(JSON.stringify(stored)).not.toContain(first.key);
  const listed = await h.request("/api/api-keys?limit=1");
  expect(listed.body.api_keys).toHaveLength(1);
  expect(listed.body.page.has_more).toBe(true);
  expect(JSON.stringify(listed.body)).not.toContain(first.key);
  expect(JSON.stringify(listed.body)).not.toContain("key_hash");
  expect(listed.response.headers.get("cache-control")).toBe("no-store");
  expect((await h.request("/api/api-keys", "bob")).body.api_keys).toEqual([]);
  expect((await h.request("/api/api-keys", "admin")).body.api_keys).toEqual([]);
  expect((await h.request("/api/api-keys?limit=1&offset=1")).body.api_keys).toHaveLength(1);
  expect((await h.request("/api/api-keys?limit=1&offset=2")).body.api_keys).toEqual([]);
});

test("API keys support collection reads and full item CRUD, including filters", async () => {
  const collection = await h.collection([{ name: "Name", type: "TEXT" }]);
  const fieldId = collection.fields[0].id;
  const { key } = await createKey();
  const path = `/api/collections/${collection.id}`;
  expect((await request("/api/collections", key)).body.collections[0].id).toBe(collection.id);
  expect((await request(path, key)).body.collection.fields).toHaveLength(1);
  const created = await request(`${path}/items`, key, "POST", {
    values: [{ field_id: fieldId, value: "Alice" }],
  });
  expect(created.status).toBe(201);
  const itemPath = `${path}/items/${created.body.item.id}`;
  expect(created.response.headers.get("location")).toBe(itemPath);
  expect((await request(itemPath, key)).body.item.values[0].value).toBe("Alice");
  const filters = encodeURIComponent(
    JSON.stringify([{ field_id: fieldId, op: "eq", value: "Alice" }]),
  );
  expect((await request(`${path}/items?filters=${filters}&limit=1`, key)).body.items).toHaveLength(
    1,
  );
  const updated = await request(itemPath, key, "PATCH", {
    values: [{ field_id: fieldId, value: "Updated" }],
  });
  expect(updated.status).toBe(200);
  expect(updated.body.item.values[0].value).toBe("Updated");
  expect(
    (
      await request(itemPath, key, "PATCH", {
        values: [{ field_id: fieldId, value: 123 }],
      })
    ).status,
  ).toBe(400);
  expect((await request(itemPath, key)).body.item.values[0].value).toBe("Updated");
  expect((await request(itemPath, key, "DELETE")).status).toBe(204);
  expect((await request(itemPath, key)).status).toBe(404);
});

test("keys cannot access other accounts or impersonate, including keys owned by admins", async () => {
  const collection = await h.collection([{ name: "Name", type: "TEXT" }], "bob");
  const item = await h.item(collection.id, [], "bob");
  const path = `/api/collections/${collection.id}`;
  for (const actor of ["alice", "admin"]) {
    const { key } = await createKey(actor);
    expect((await request("/api/collections", key)).body.collections).toEqual([]);
    for (const [target, method, input] of [
      [path, "GET", undefined],
      [`${path}/items`, "GET", undefined],
      [`${path}/items`, "POST", {}],
      [`${path}/items/${item.id}`, "GET", undefined],
      [
        `${path}/items/${item.id}`,
        "PATCH",
        { values: [{ field_id: collection.fields[0].id, value: "No" }] },
      ],
      [`${path}/items/${item.id}`, "DELETE", undefined],
    ] as const) {
      expect((await request(target, key, method, input)).status).toBe(404);
    }
    for (const target of ["/api/collections", path, `${path}/items`, `${path}/items/${item.id}`]) {
      expect((await request(`${target}?actAs=${h.users.bob.id}`, key)).status).toBe(403);
      expect(
        (await request(`${target}?actAs=${h.users[actor as "alice" | "admin"].id}`, key)).status,
      ).toBe(403);
    }
  }
});

test("API keys cannot mutate collections, access fields/users, or manage API keys", async () => {
  const collection = await h.collection([{ name: "Name", type: "TEXT" }], "admin");
  const { key, api_key } = await createKey("admin");
  const path = `/api/collections/${collection.id}`;
  for (const [target, method] of [
    ["/api/collections", "POST"],
    [path, "PATCH"],
    [path, "DELETE"],
    [`${path}/fields`, "GET"],
    [`${path}/fields`, "POST"],
    [`${path}/fields/${collection.fields[0].id}`, "GET"],
    [`${path}/fields/${collection.fields[0].id}`, "PATCH"],
    [`${path}/fields/${collection.fields[0].id}`, "DELETE"],
    ["/api/users", "GET"],
    ["/api/users", "POST"],
    ["/api/users/me", "GET"],
    [`/api/users/${h.users.bob.id}`, "GET"],
    [`/api/users/${h.users.bob.id}`, "PATCH"],
    [`/api/users/${h.users.bob.id}`, "DELETE"],
    ["/api/api-keys", "GET"],
    ["/api/api-keys", "POST"],
    [`/api/api-keys/${api_key.id}`, "DELETE"],
  ])
    expect((await request(target, key, method, method === "GET" ? undefined : {})).status).toBe(
      403,
    );
});

test("revocation is owner-scoped and takes effect; deleting an account removes its keys", async () => {
  const { key, api_key } = await createKey();
  for (const actor of ["bob", "admin"])
    expect((await h.request(`/api/api-keys/${api_key.id}`, actor, "DELETE")).status).toBe(404);
  expect((await request("/api/collections", key)).status).toBe(200);
  expect((await h.request(`/api/api-keys/${api_key.id}`, "alice", "DELETE")).status).toBe(204);
  expect((await request("/api/collections", key)).status).toBe(401);
  const remaining = await createKey();
  expect((await h.request(`/api/users/${h.users.alice.id}`, "admin", "DELETE")).status).toBe(204);
  expect((await request("/api/collections", remaining.key)).status).toBe(401);
  expect(await h.db.query("SELECT * FROM crm_api_keys")).toEqual([]);
});

test("missing, malformed, unknown and mixed credentials are rejected without fallback", async () => {
  expect((await h.app.request("/api/collections", {}, env)).status).toBe(401);
  for (const key of ["", "bad-key", `crm_${"0".repeat(64)}`])
    expect((await request("/api/collections", key)).status).toBe(401);
  const { key } = await createKey();
  expect((await request("/api/collections", key.replace(/.$/, "z"))).status).toBe(401);
  expect(
    (
      await h.app.request(
        "/api/collections",
        {
          headers: { "x-api-key": key, authorization: "Bearer admin" },
        },
        env,
      )
    ).status,
  ).toBe(400);
  // API key authentication does not invoke Google verification or require its client ID.
  expect(
    (
      await h.app.request(
        "/api/collections",
        {
          headers: { "x-api-key": key },
        },
        { ...env, GOOGLE_CLIENT_ID: "" },
      )
    ).status,
  ).toBe(200);
});

test("key creation requires registration and validates names and unknown properties", async () => {
  expect((await h.request("/api/api-keys", "newcomer", "POST", { name: "Sync" })).status).toBe(403);
  for (const input of [
    {},
    { name: " " },
    { name: "x".repeat(201) },
    { name: "Sync", user_id: h.users.bob.id },
    { name: "Sync", role: "ADMIN" },
  ])
    expect((await h.request("/api/api-keys", "alice", "POST", input)).status).toBe(400);
  const created = await h.request("/api/api-keys", "alice", "POST", { name: "Sync" });
  expect(created.response.headers.get("cache-control")).toBe("no-store");
  expect(created.response.headers.get("location")).toBe(`/api/api-keys/${created.body.api_key.id}`);
  expect((await h.request("/api/api-keys?actAs=" + h.users.bob.id)).status).toBe(400);
});
