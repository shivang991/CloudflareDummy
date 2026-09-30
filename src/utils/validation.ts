import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

export const inputError =
  "Send JSON with a nonempty title (max 200 characters) and optional description (max 2000 characters)";

export const requireJson: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.req.header("content-type")?.toLowerCase().includes("application/json")) {
    return c.json({ error: inputError }, 400);
  }
  await next();
};
