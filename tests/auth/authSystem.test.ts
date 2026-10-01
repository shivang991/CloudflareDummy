import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createHarness, env, type Harness } from "../utils/harness";
import { seedStatements, seedIds } from "../../scripts/seed.mjs";

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

test("self registration and account CRU cannot assign roles or delete", async () => {
  expect((await h.request("/api/users/me", "newcomer")).status).toBe(403);
  expect((await h.request("/api/users", "newcomer", "POST", { role: "ADMIN" })).status).toBe(403);
  expect(
    (await h.request("/api/users", "newcomer", "POST", { email: "other@example.com" })).status,
  ).toBe(403);
  const created = await h.request("/api/users", "newcomer", "POST", { profile: { name: "New" } });
  expect(created.status).toBe(201);
  expect(created.body.user).toMatchObject({
    email: "new@example.com",
    role: "USER",
    profile: { name: "New" },
  });
  expect((await h.request("/api/users", "newcomer", "POST", {})).status).toBe(409);
  const id = created.body.user.id;
  expect((await h.request(`/api/users/${id}`, "newcomer")).status).toBe(200);
  const updated = await h.request(`/api/users/${id}`, "newcomer", "PATCH", {
    profile: { name: "Updated" },
  });
  expect(updated.body.user.profile).toEqual({ name: "Updated" });
  expect((await h.request(`/api/users/${id}`, "newcomer", "PATCH", { role: "ADMIN" })).status).toBe(
    403,
  );
  expect(
    (await h.request(`/api/users/${id}`, "newcomer", "PATCH", { email: "admin@example.com" }))
      .status,
  ).toBe(403);
  expect((await h.request(`/api/users/${id}`, "newcomer", "DELETE")).status).toBe(403);
  expect((await h.request(`/api/users/${h.users.bob.id}`, "alice")).status).toBe(404);
  expect(
    (await h.request(`/api/users/${h.users.bob.id}`, "alice", "PATCH", { profile: {} })).status,
  ).toBe(404);
  expect((await h.request("/api/users", "alice")).status).toBe(403);
});

test("admin account CRUD and provisioned email linking", async () => {
  const created = await h.request("/api/users", "admin", "POST", {
    email: "NEW@example.com",
    role: "USER",
  });
  expect(created.status).toBe(201);
  const id = created.body.user.id;
  expect((await h.request("/api/users/me", "newcomer")).body.user.id).toBe(id);
  const promoted = await h.request(`/api/users/${id}`, "admin", "PATCH", { role: "ADMIN" });
  expect(promoted.body.user.role).toBe("ADMIN");
  expect((await h.request(`/api/users/${id}`, "admin")).status).toBe(200);
  const listed = await h.request("/api/users?limit=2", "admin");
  expect(listed.body.users).toHaveLength(2);
  expect(listed.body.page.has_more).toBe(true);
  expect((await h.request(`/api/users/${id}`, "admin", "DELETE")).status).toBe(204);
  expect((await h.request(`/api/users/${id}`, "admin")).status).toBe(404);
});

test("public health/OpenAPI and authentication failures", async () => {
  expect((await h.app.request("/health", {}, env)).status).toBe(200);
  const response = await h.app.request("/openapi.json", {}, env);
  const spec = await response.json();
  expect(spec.info.title).toBe("Mini CRM API");
  expect(spec.paths["/api/items"]).toBeUndefined();
  expect(
    spec.paths["/api/collections/{collectionId}/items"].get.parameters.some(
      (p: { name: string }) => p.name === "filters",
    ),
  ).toBe(true);
  expect(spec.components.schemas.ItemFilter).toBeDefined();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const operation of Object.values(methods as Record<string, { security?: unknown }>)) {
      if (path.startsWith("/api/")) expect(operation.security).toEqual([{ GoogleIdToken: [] }]);
    }
  }
  expect((await h.app.request("/api/users/me", {}, env)).status).toBe(401);
  expect((await h.request("/api/users/me", "invalid")).status).toBe(401);
  expect((await h.request("/api/users/not-an-id")).status).toBe(400);
  expect((await h.request("/api/users/me?unused=1")).status).toBe(200);
});

test("seed is repeatable, has one admin, and covers every field type", async () => {
  await h.pg.exec("TRUNCATE crm_users CASCADE");
  await h.db.transaction(seedStatements("admin@example.com"));
  await h.db.transaction(seedStatements("admin@example.com"));
  expect((await h.db.query("SELECT role FROM crm_users WHERE role = 'ADMIN'")).length).toBe(1);
  expect((await h.db.query("SELECT * FROM crm_users")).length).toBe(2);
  expect((await h.db.query("SELECT DISTINCT type FROM crm_fields")).length).toBe(7);
  expect(
    (await h.db.query("SELECT * FROM crm_field_values WHERE item_id = $1", [seedIds.contactItem]))
      .length,
  ).toBe(7);
  const admin = await h.request("/api/users/me", "admin");
  expect(admin.body.user.role).toBe("ADMIN");
  await expect(h.db.transaction(seedStatements("different@example.com"))).rejects.toThrow(
    "another admin already exists",
  );
  expect((await h.db.query("SELECT * FROM crm_users")).length).toBe(2);
  expect(() => seedStatements("bad-email")).toThrow();
});

test("migration batches apply repeatedly with PL/pgSQL bodies intact", async () => {
  const { migrationStatements } = await import("../../scripts/migrate.mjs");
  await h.db.transaction(migrationStatements(h.schema));
  await h.db.transaction(migrationStatements(h.schema));
  expect((await h.request("/api/users/me")).body.user.id).toBe(h.users.alice.id);
});
