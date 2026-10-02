import type { Context } from "hono";
import type { AppEnv } from "../utils/types";
import { ApiError } from "../utils/http";
import { usersRepository } from "./repository";

export function requireUser(c: Context<AppEnv>) {
  const user = c.get("user");
  if (!user) throw new ApiError(403, "Create your account with POST /api/users first");
  return user;
}

export function requireAdmin(c: Context<AppEnv>) {
  const user = requireUser(c);
  if (user.role !== "ADMIN") throw new ApiError(403, "Admin role required");
  return user;
}

export function authorizeUser(c: Context<AppEnv>, id: string) {
  const user = requireUser(c);
  if (user.role !== "ADMIN" && user.id !== id) throw new ApiError(404, "User not found");
}

export async function accountScope(c: Context<AppEnv>, actAs?: string) {
  const user = requireUser(c);
  if (!actAs) return user.id;
  if (c.get("authMethod") === "apiKey") throw new ApiError(403, "API keys cannot use actAs");
  requireAdmin(c);
  if (!(await usersRepository(c.get("db")).get(actAs)))
    throw new ApiError(404, "Account not found");
  return actAs;
}
