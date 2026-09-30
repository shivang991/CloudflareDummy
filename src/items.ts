import { neon } from "@neondatabase/serverless";
import { Hono } from "hono";
import type { AppEnv } from "./types";

type ItemInput = { title: string; description: string };

const inputError = "Send JSON with a nonempty title (max 200 characters) and optional description (max 2000 characters)";
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function parseInput(value: unknown): ItemInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== "string" || item.title.trim().length === 0 || item.title.trim().length > 200) return null;
  if (item.description !== undefined && typeof item.description !== "string") return null;
  const description = item.description ?? "";
  if ((description as string).length > 2000) return null;
  return { title: item.title.trim(), description: description as string };
}

export const items = new Hono<AppEnv>();

items.use("/items/:id", async (c, next) => {
  if (!uuidPattern.test(c.req.param("id"))) return c.json({ error: "Invalid item ID" }, 400);
  await next();
});

items.get("/items", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const rows = await sql`SELECT id, title, description, created_at, updated_at FROM api_items ORDER BY created_at DESC LIMIT 100`;
  return c.json({ items: rows });
});

items.post("/items", async (c) => {
  if (!c.req.header("content-type")?.toLowerCase().includes("application/json")) {
    return c.json({ error: inputError }, 400);
  }
  const input = parseInput(await c.req.json().catch(() => null));
  if (!input) return c.json({ error: inputError }, 400);

  const sql = neon(c.env.DATABASE_URL);
  const id = crypto.randomUUID();
  const [item] = await sql`INSERT INTO api_items (id, title, description) VALUES (${id}, ${input.title}, ${input.description}) RETURNING id, title, description, created_at, updated_at`;
  c.header("Location", `/api/items/${id}`);
  return c.json({ item }, 201);
});

items.get("/items/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const [item] = await sql`SELECT id, title, description, created_at, updated_at FROM api_items WHERE id = ${c.req.param("id")}`;
  return item ? c.json({ item }) : c.json({ error: "Not found" }, 404);
});

items.put("/items/:id", async (c) => {
  if (!c.req.header("content-type")?.toLowerCase().includes("application/json")) {
    return c.json({ error: inputError }, 400);
  }
  const input = parseInput(await c.req.json().catch(() => null));
  if (!input) return c.json({ error: inputError }, 400);

  const sql = neon(c.env.DATABASE_URL);
  const [item] = await sql`UPDATE api_items SET title = ${input.title}, description = ${input.description}, updated_at = now() WHERE id = ${c.req.param("id")} RETURNING id, title, description, created_at, updated_at`;
  return item ? c.json({ item }) : c.json({ error: "Not found" }, 404);
});

items.delete("/items/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const [item] = await sql`DELETE FROM api_items WHERE id = ${c.req.param("id")} RETURNING id`;
  return item ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

items.all("/items", (c) => c.json({ error: "Method not allowed" }, 405, { Allow: "GET, POST" }));
items.all("/items/:id", (c) => c.json({ error: "Method not allowed" }, 405, { Allow: "GET, PUT, DELETE" }));
