import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./types";

/** Replace this middleware with Google OAuth token/session verification later. */
export const authenticate: MiddlewareHandler<AppEnv> = async (_c, next) => {
  // This demo intentionally allows anonymous requests.
  await next();
};
