import { neon } from "@neondatabase/serverless";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./types";

export const inputError =
  "Send JSON with a nonempty title (max 200 characters) and optional description (max 2000 characters)";
const itemInputSchema = z.object({
  title: z.string().trim().min(1).max(200).openapi({ example: "Example item" }),
  description: z.string().max(2000).default("").openapi({ example: "Optional details" }),
});
const itemSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi("Item");
const errorSchema = z.object({ error: z.string() }).openapi("Error");
const idParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
    .openapi({
      param: { name: "id", in: "path" },
      example: "123e4567-e89b-42d3-a456-426614174000",
    }),
});
const jsonContent = (schema: typeof itemSchema | typeof errorSchema | z.ZodObject) => ({
  "application/json": { schema },
});
const itemResponse = { description: "Item", content: jsonContent(z.object({ item: itemSchema })) };
const errorResponse = (description: string) => ({
  description,
  content: jsonContent(errorSchema),
});
const requestBody = {
  required: true,
  content: { "application/json": { schema: itemInputSchema } },
} as const;

const requireJson: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.req.header("content-type")?.toLowerCase().includes("application/json")) {
    return c.json({ error: inputError }, 400);
  }
  await next();
};

export const items = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (!result.success) return c.json({ error: inputError }, 400);
  },
});

items.use("/items/:id", async (c, next) => {
  if (!idParamsSchema.safeParse({ id: c.req.param("id") }).success)
    return c.json({ error: "Invalid item ID" }, 400);
  await next();
});

items.openapi(
  createRoute({
    method: "get",
    path: "/items",
    summary: "List items",
    description: "Returns the 100 newest items.",
    responses: {
      200: {
        description: "Items ordered by creation time, newest first",
        content: jsonContent(z.object({ items: z.array(itemSchema) })),
      },
      500: errorResponse("Server error"),
    },
  }),
  async (c) => {
    const sql = neon(c.env.DATABASE_URL);
    const rows =
      await sql`SELECT id, title, description, created_at, updated_at FROM api_items ORDER BY created_at DESC LIMIT 100`;
    return c.json({ items: rows }, 200);
  },
);

items.openapi(
  createRoute({
    method: "post",
    path: "/items",
    summary: "Create an item",
    middleware: [requireJson],
    request: { body: requestBody },
    responses: {
      201: {
        ...itemResponse,
        description: "Created item",
        headers: { Location: { schema: { type: "string" } } },
      },
      400: errorResponse("Invalid JSON or item fields"),
      500: errorResponse("Server error"),
    },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const sql = neon(c.env.DATABASE_URL);
    const id = crypto.randomUUID();
    const [item] =
      await sql`INSERT INTO api_items (id, title, description) VALUES (${id}, ${input.title}, ${input.description}) RETURNING id, title, description, created_at, updated_at`;
    c.header("Location", `/api/items/${id}`);
    return c.json({ item }, 201);
  },
);

items.openapi(
  createRoute({
    method: "get",
    path: "/items/{id}",
    summary: "Get an item",
    request: { params: idParamsSchema },
    responses: {
      200: itemResponse,
      400: errorResponse("Invalid item ID"),
      404: errorResponse("Item not found"),
      500: errorResponse("Server error"),
    },
  }),
  async (c) => {
    const sql = neon(c.env.DATABASE_URL);
    const [item] =
      await sql`SELECT id, title, description, created_at, updated_at FROM api_items WHERE id = ${c.req.valid("param").id}`;
    return item ? c.json({ item }, 200) : c.json({ error: "Not found" }, 404);
  },
);

items.openapi(
  createRoute({
    method: "put",
    path: "/items/{id}",
    summary: "Replace an item",
    description: "Replaces title and description. Omitted description becomes an empty string.",
    middleware: [requireJson],
    request: { params: idParamsSchema, body: requestBody },
    responses: {
      200: itemResponse,
      400: errorResponse("Invalid item ID, JSON, or item fields"),
      404: errorResponse("Item not found"),
      500: errorResponse("Server error"),
    },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const sql = neon(c.env.DATABASE_URL);
    const [item] =
      await sql`UPDATE api_items SET title = ${input.title}, description = ${input.description}, updated_at = now() WHERE id = ${c.req.valid("param").id} RETURNING id, title, description, created_at, updated_at`;
    return item ? c.json({ item }, 200) : c.json({ error: "Not found" }, 404);
  },
);

items.openapi(
  createRoute({
    method: "delete",
    path: "/items/{id}",
    summary: "Delete an item",
    request: { params: idParamsSchema },
    responses: {
      204: { description: "Item deleted" },
      400: errorResponse("Invalid item ID"),
      404: errorResponse("Item not found"),
      500: errorResponse("Server error"),
    },
  }),
  async (c) => {
    const sql = neon(c.env.DATABASE_URL);
    const [item] =
      await sql`DELETE FROM api_items WHERE id = ${c.req.valid("param").id} RETURNING id`;
    return item ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  },
);

items.all("/items", (c) => c.json({ error: "Method not allowed" }, 405, { Allow: "GET, POST" }));
items.all("/items/:id", (c) =>
  c.json({ error: "Method not allowed" }, 405, { Allow: "GET, PUT, DELETE" }),
);
