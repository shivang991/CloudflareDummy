import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createHarness, type Harness } from "../utils/harness";
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

test("collection CRUD is scoped; admin must select another account explicitly", async () => {
  const c = await h.collection([{ name: "Name", type: "TEXT" }]);
  const path = `/api/collections/${c.id}`;
  expect((await h.request(path, "bob")).status).toBe(404);
  expect((await h.request(path, "bob", "PATCH", { name: "Stolen" })).status).toBe(404);
  expect((await h.request(path, "bob", "DELETE")).status).toBe(404);
  expect((await h.request(path, "admin")).status).toBe(404);
  expect((await h.request(`${path}?actAs=${h.users.alice.id}`, "admin")).status).toBe(200);
  expect((await h.request(`${path}?actAs=${h.users.alice.id}`, "bob")).status).toBe(403);
  expect((await h.request(`/api/collections?actAs=${h.users.alice.id}`, "alice")).status).toBe(403);
  expect((await h.request("/api/collections", "bob")).body.collections).toEqual([]);
  const updated = await h.request(`${path}?actAs=${h.users.alice.id}`, "admin", "PATCH", {
    name: "Renamed",
  });
  expect(updated.body.collection.name).toBe("Renamed");
  expect((await h.request(path, "alice", "PATCH", { user_id: h.users.bob.id })).status).toBe(400);
  expect((await h.request(path, "alice", "DELETE")).status).toBe(204);
  expect((await h.request(path)).status).toBe(404);
});

test("collection field change sets are atomic and only names/fields are mutable", async () => {
  const c = await h.collection([{ name: "Name", type: "TEXT" }]);
  const field = c.fields[0];
  const path = `/api/collections/${c.id}`;
  const updated = await h.request(path, "alice", "PATCH", {
    name: "Leads",
    fields: {
      rename: [{ id: field.id, name: "Contact name" }],
      add: [{ name: "Revenue", type: "NUMBER" }],
    },
  });
  expect(updated.status).toBe(200);
  expect(updated.body.collection.fields.map((f: { name: string }) => f.name).sort()).toEqual([
    "Contact name",
    "Revenue",
  ]);
  const conflict = await h.request(path, "alice", "PATCH", {
    name: "Must roll back",
    fields: { add: [{ name: "Contact name", type: "BOOL" }] },
  });
  expect(conflict.status).toBe(409);
  expect((await h.request(path)).body.collection.name).toBe("Leads");
  expect(
    (
      await h.request(path, "alice", "PATCH", {
        fields: { rename: [{ id: crypto.randomUUID(), name: "Nope" }] },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await h.request(path, "alice", "PATCH", {
        fields: { rename: [{ id: field.id, name: "Again", type: "BOOL" }] },
      })
    ).status,
  ).toBe(400);
});

test("creation validates JSON and rolls back invalid relation targets", async () => {
  const other = await h.collection([], "bob");
  const result = await h.request("/api/collections", "alice", "POST", {
    name: "Invalid",
    fields: [{ name: "Link", type: "RELATION", relation_collection_id: other.id }],
  });
  expect(result.status).toBe(409);
  expect((await h.request("/api/collections")).body.collections).toHaveLength(0);
  const malformed = await h.app.request(
    "/api/collections",
    {
      method: "POST",
      headers: { authorization: "Bearer alice", "content-type": "application/json" },
      body: "{",
    },
    { DATABASE_URL: "test", GOOGLE_CLIENT_ID: "test" },
  );
  expect(malformed.status).toBe(400);
  expect((await h.request("/api/collections", "alice", "POST", { name: " " })).status).toBe(400);
  expect((await h.request("/api/collections?limit=101")).status).toBe(400);
});

test("admin creates and deletes collections for another account through actAs", async () => {
  const scope = `?actAs=${h.users.bob.id}`;
  const created = await h.request(`/api/collections${scope}`, "admin", "POST", {
    name: "Admin provisioned",
  });
  expect(created.status).toBe(201);
  expect(created.body.collection.user_id).toBe(h.users.bob.id);
  expect((await h.request("/api/collections", "bob")).body.collections).toHaveLength(1);
  expect(
    (await h.request(`/api/collections/${created.body.collection.id}${scope}`, "admin", "DELETE"))
      .status,
  ).toBe(204);
  expect((await h.request(`/api/collections?actAs=${crypto.randomUUID()}`, "admin")).status).toBe(
    404,
  );
});
