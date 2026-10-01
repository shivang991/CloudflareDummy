import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../utils/types";
import type { Identity } from "./schemas";
import { emailSchema } from "./schemas";
import { usersRepository } from "./repository";
import type { Database } from "../utils/database";

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
    c.set("identity", identity);
    c.set("user", await usersRepository(db).resolve(identity));
    await next();
  };
}
