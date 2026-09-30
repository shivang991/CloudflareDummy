import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { authenticate } from "./auth";
import { inputError, items } from "./items";
import type { AppEnv } from "./types";

const app = new OpenAPIHono<AppEnv>();

app.openapi(
  createRoute({
    method: "get",
    path: "/health",
    summary: "Worker health",
    description: "Does not query the database.",
    responses: {
      200: {
        description: "Worker is running",
        content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
      },
    },
  }),
  (c) => c.json({ ok: true as const }, 200),
);
app.use("/api/*", authenticate);
app.route("/api", items);
app.doc("/openapi.json", {
  openapi: "3.0.3",
  info: {
    title: "Items API",
    version: "1.0.0",
    description: "Public JSON API for creating, listing, reading, replacing, and deleting items.",
  },
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException && error.status === 400) {
    return c.json({ error: inputError }, 400);
  }
  console.error("Request failed", error);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
