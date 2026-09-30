import { Hono } from "hono";
import { authenticate } from "./auth";
import { items } from "./items";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));
app.use("/api/*", authenticate);
app.route("/api", items);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((error, c) => {
  console.error("Request failed", error);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
