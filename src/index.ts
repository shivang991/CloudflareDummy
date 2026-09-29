import { neon } from "@neondatabase/serverless";
import { authenticate } from "./auth";

interface Env {
  DATABASE_URL: string;
}

type ItemInput = { title: string; description: string };

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });

function parseInput(value: unknown): ItemInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== "string" || item.title.trim().length === 0 || item.title.trim().length > 200) return null;
  if (item.description !== undefined && typeof item.description !== "string") return null;
  const description = item.description ?? "";
  if ((description as string).length > 2000) return null;
  return { title: item.title.trim(), description: description as string };
}

async function readInput(request: Request): Promise<ItemInput | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  try {
    return parseInput(await request.json());
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname === "/health" && method === "GET") return json({ ok: true });
    if (url.pathname !== "/api/items" && !/^\/api\/items\/[^/]+$/.test(url.pathname)) {
      return json({ error: "Not found" }, 404);
    }

    try {
      await authenticate(request);
      const sql = neon(env.DATABASE_URL);

      if (url.pathname === "/api/items") {
        if (method === "GET") {
          const items = await sql`SELECT id, title, description, created_at, updated_at FROM api_items ORDER BY created_at DESC LIMIT 100`;
          return json({ items });
        }
        if (method === "POST") {
          const input = await readInput(request);
          if (!input) return json({ error: "Send JSON with a nonempty title (max 200 characters) and optional description (max 2000 characters)" }, 400);
          const id = crypto.randomUUID();
          const [item] = await sql`INSERT INTO api_items (id, title, description) VALUES (${id}, ${input.title}, ${input.description}) RETURNING id, title, description, created_at, updated_at`;
          return json({ item }, 201, { Location: `/api/items/${id}` });
        }
        return json({ error: "Method not allowed" }, 405, { Allow: "GET, POST" });
      }

      const id = url.pathname.slice("/api/items/".length);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return json({ error: "Invalid item ID" }, 400);
      }

      if (method === "GET") {
        const [item] = await sql`SELECT id, title, description, created_at, updated_at FROM api_items WHERE id = ${id}`;
        return item ? json({ item }) : json({ error: "Not found" }, 404);
      }
      if (method === "PUT") {
        const input = await readInput(request);
        if (!input) return json({ error: "Send JSON with a nonempty title (max 200 characters) and optional description (max 2000 characters)" }, 400);
        const [item] = await sql`UPDATE api_items SET title = ${input.title}, description = ${input.description}, updated_at = now() WHERE id = ${id} RETURNING id, title, description, created_at, updated_at`;
        return item ? json({ item }) : json({ error: "Not found" }, 404);
      }
      if (method === "DELETE") {
        const [item] = await sql`DELETE FROM api_items WHERE id = ${id} RETURNING id`;
        return item ? new Response(null, { status: 204 }) : json({ error: "Not found" }, 404);
      }
      return json({ error: "Method not allowed" }, 405, { Allow: "GET, PUT, DELETE" });
    } catch (error) {
      console.error("Request failed", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
};
