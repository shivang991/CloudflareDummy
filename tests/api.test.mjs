import { neon } from "@neondatabase/serverless";
import { beforeEach, expect, test, vi } from "vitest";
import app from "../src/index";

vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));

const items = new Map();
const env = { DATABASE_URL: "postgresql://test" };

beforeEach(() => {
  items.clear();
  neon.mockImplementation(() => async (strings, ...values) => {
    const query = strings.join("?").trim();
    if (query.startsWith("INSERT INTO api_items")) {
      const [id, title, description] = values;
      const item = { id, title, description, created_at: new Date(), updated_at: new Date() };
      items.set(id, item);
      return [{ ...item }];
    }
    if (query.startsWith("SELECT") && query.includes("ORDER BY")) {
      return [...items.values()]
        .reverse()
        .slice(0, 100)
        .map((item) => ({ ...item }));
    }
    if (query.startsWith("SELECT")) {
      const item = items.get(values[0]);
      return item ? [{ ...item }] : [];
    }
    if (query.startsWith("UPDATE api_items")) {
      const [title, description, id] = values;
      const item = items.get(id);
      if (!item) return [];
      Object.assign(item, { title, description, updated_at: new Date() });
      return [{ ...item }];
    }
    if (query.startsWith("DELETE FROM api_items")) {
      const item = items.get(values[0]);
      items.delete(values[0]);
      return item ? [{ id: item.id }] : [];
    }
    throw new Error(`Unexpected SQL: ${query}`);
  });
});

async function call(path, init) {
  const response = await app.request(path, init, env);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

const json = (value, method = "POST") => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});

test("health and item CRUD", async () => {
  const health = await call("/health");
  expect(health.response.status).toBe(200);
  expect(health.body).toEqual({ ok: true });

  const created = await call(
    "/api/items",
    json({ title: "  Test item  ", description: "Created by Vitest" }),
  );
  expect(created.response.status).toBe(201);
  expect(created.body.item.title).toBe("Test item");
  const id = created.body.item.id;
  expect(created.response.headers.get("location")).toBe(`/api/items/${id}`);

  const listed = await call("/api/items");
  expect(listed.response.status).toBe(200);
  expect(listed.body.items).toContainEqual(created.body.item);

  const fetched = await call(`/api/items/${id}`);
  expect(fetched.response.status).toBe(200);
  expect(fetched.body.item.title).toBe("Test item");

  const updated = await call(`/api/items/${id}`, json({ title: "Updated test item" }, "PUT"));
  expect(updated.response.status).toBe(200);
  expect(updated.body.item).toMatchObject({ title: "Updated test item", description: "" });

  const deleted = await call(`/api/items/${id}`, { method: "DELETE" });
  expect(deleted.response.status).toBe(204);
  expect(deleted.body).toBeNull();

  const missing = await call(`/api/items/${id}`);
  expect(missing.response.status).toBe(404);
});

test("rejects invalid input, IDs, and methods", async () => {
  const emptyTitle = await call("/api/items", json({ title: "" }));
  expect(emptyTitle.response.status).toBe(400);

  const invalidDescription = await call("/api/items", json({ title: "Valid", description: 42 }));
  expect(invalidDescription.response.status).toBe(400);

  const malformedJson = await call("/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  expect(malformedJson.response.status).toBe(400);

  const invalidId = await call("/api/items/not-a-uuid");
  expect(invalidId.response.status).toBe(400);

  const wrongMethod = await call("/api/items", { method: "PUT" });
  expect(wrongMethod.response.status).toBe(405);
  expect(wrongMethod.response.headers.get("allow")).toBe("GET, POST");
  expect(items.size).toBe(0);
});
