import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../utils/types";
import type { Identity } from "./schemas";
import { emailSchema } from "./schemas";
import { usersRepository } from "./repository";
import type { Database } from "../utils/database";
import { apiKeyPattern, apiKeysRepository } from "./apiKeys";

function allowsApiKey(method: string, path: string) {
  if (method === "GET" && /^\/api\/collections(?:\/[^/]+)?$/.test(path)) return true;
  const items = /^\/api\/collections\/[^/]+\/items(\/[^/]+)?$/.exec(path);
  if (!items) return false;
  return items[1] ? ["GET", "PATCH", "DELETE"].includes(method) : ["GET", "POST"].includes(method);
}

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type VerifyIdentity = (token: string, audience: string) => Promise<Identity>;

export const verifyGoogleIdentity: VerifyIdentity = async (token, audience) => {
  const { payload } = await jwtVerify(token, googleKeys, {
    algorithms: ["RS256"],
    audience,
    issuer: ["accounts.google.com", "https://accounts.google.com"],
  });
  if (!payload.sub || !payload.exp || payload.email_verified !== true)
    throw new Error("Verified email and expiration required");
  return { sub: payload.sub, email: emailSchema.parse(payload.email) };
};

export function authenticate(
  databaseFactory: (url: string) => Database,
  verify: VerifyIdentity,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const apiKey = c.req.header("x-api-key");
    if (apiKey !== undefined) {
      if (c.req.header("authorization") !== undefined)
        return c.json({ error: "Use either X-API-Key or Authorization, not both" }, 400);
      if (!apiKeyPattern.test(apiKey)) return c.json({ error: "Invalid API key" }, 401);
      const db = databaseFactory(c.env.DATABASE_URL);
      const user = await apiKeysRepository(db).resolve(apiKey);
      if (!user) return c.json({ error: "Invalid API key" }, 401);
      if (!allowsApiKey(c.req.method, c.req.path))
        return c.json({ error: "API keys allow item CRUD and collection reads only" }, 403);
      c.set("db", db);
      c.set("user", user);
      c.set("authMethod", "apiKey");
      await next();
      return;
    }
    const match = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
      c.header("WWW-Authenticate", 'Bearer realm="api"');
      return c.json({ error: "Google ID token required" }, 401);
    }
    if (!c.env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not configured");
    let identity: Identity;
    try {
      identity = await verify(match[1], c.env.GOOGLE_CLIENT_ID);
    } catch {
      c.header("WWW-Authenticate", 'Bearer realm="api", error="invalid_token"');
      return c.json({ error: "Invalid Google ID token" }, 401);
    }
    const db = databaseFactory(c.env.DATABASE_URL);
    c.set("db", db);
    c.set("authMethod", "google");
    c.set("identity", identity);
    c.set("user", await usersRepository(db).resolve(identity));
    await next();
  };
}
