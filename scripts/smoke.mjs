import assert from "node:assert/strict";

const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";
let id;

async function call(path, options) {
  const response = await fetch(new URL(path, base), options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

try {
  const health = await call("/health");
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.body, { ok: true });

  const created = await call("/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Smoke test", description: "Created by smoke.mjs" }),
  });
  assert.equal(created.response.status, 201);
  id = created.body.item.id;

  const listed = await call("/api/items");
  assert.equal(listed.response.status, 200);
  assert.ok(listed.body.items.some((item) => item.id === id));

  const fetched = await call(`/api/items/${id}`);
  assert.equal(fetched.response.status, 200, JSON.stringify({ id, body: fetched.body }));
  assert.equal(fetched.body.item.title, "Smoke test");

  const updated = await call(`/api/items/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Updated smoke test" }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.item.title, "Updated smoke test");

  const invalid = await call("/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "" }),
  });
  assert.equal(invalid.response.status, 400);

  const invalidId = await call("/api/items/not-a-uuid");
  assert.equal(invalidId.response.status, 400);

  const wrongMethod = await call("/api/items", { method: "PUT" });
  assert.equal(wrongMethod.response.status, 405);
  assert.equal(wrongMethod.response.headers.get("allow"), "GET, POST");

  const deleted = await call(`/api/items/${id}`, { method: "DELETE" });
  assert.equal(deleted.response.status, 204);
  id = undefined;

  const missing = await call(`/api/items/${created.body.item.id}`);
  assert.equal(missing.response.status, 404);
  console.log("CRUD smoke test passed.");
} finally {
  if (id) await call(`/api/items/${id}`, { method: "DELETE" });
}
