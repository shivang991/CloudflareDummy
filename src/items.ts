import { neon } from "@neondatabase/serverless";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";

const inputError =
  "Send JSON with a nonempty title (max 200 characters) and optional description (max 2000 characters)";
const itemInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(""),
});
const itemIdSchema = z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);

export const items = new Hono<AppEnv>();

items.use("/items/:id", async (c, next) => {
  if (!itemIdSchema.safeParse(c.req.param("id")).success)
    return c.json({ error: "Invalid item ID" }, 400);
  await next();
});

items.get("/items", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const rows =
    await sql`SELECT id, title, description, created_at, updated_at FROM api_items ORDER BY created_at DESC LIMIT 100`;
  return c.json({ items: rows });
});

items.post("/items", async (c) => {
  if (!c.req.header("content-type")?.toLowerCase().includes("application/json")) {
    return c.json({ error: inputError }, 400);
  }
  const parsed = itemInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: inputError }, 400);
  const input = parsed.data;

  const sql = neon(c.env.DATABASE_URL);
  const id = crypto.randomUUID();
  const [item] =
    await sql`INSERT INTO api_items (id, title, description) VALUES (${id}, ${input.title}, ${input.description}) RETURNING id, title, description, created_at, updated_at`;
  c.header("Location", `/api/items/${id}`);
  return c.json({ item }, 201);
});

items.get("/items/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const [item] =
    await sql`SELECT id, title, description, created_at, updated_at FROM api_items WHERE id = ${c.req.param("id")}`;
  return item ? c.json({ item }) : c.json({ error: "Not found" }, 404);
});

items.put("/items/:id", async (c) => {
  if (!c.req.header("content-type")?.toLowerCase().includes("application/json")) {
    return c.json({ error: inputError }, 400);
  }
  const parsed = itemInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: inputError }, 400);
  const input = parsed.data;

  const sql = neon(c.env.DATABASE_URL);
  const [item] =
    await sql`UPDATE api_items SET title = ${input.title}, description = ${input.description}, updated_at = now() WHERE id = ${c.req.param("id")} RETURNING id, title, description, created_at, updated_at`;
  return item ? c.json({ item }) : c.json({ error: "Not found" }, 404);
});

items.delete("/items/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const [item] = await sql`DELETE FROM api_items WHERE id = ${c.req.param("id")} RETURNING id`;
  return item ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

items.all("/items", (c) => c.json({ error: "Method not allowed" }, 405, { Allow: "GET, POST" }));
items.all("/items/:id", (c) =>
  c.json({ error: "Method not allowed" }, 405, { Allow: "GET, PUT, DELETE" }),
);
