import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./types";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    c.header("WWW-Authenticate", 'Bearer realm="api"');
    return c.json({ error: "Google ID token required" }, 401);
  }

  const audience = c.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error("GOOGLE_CLIENT_ID is not configured");

  try {
    const { payload } = await jwtVerify(match[1], googleKeys, {
      algorithms: ["RS256"],
      audience,
      issuer: ["accounts.google.com", "https://accounts.google.com"],
    });
    if (!payload.sub) throw new Error("Google ID token has no subject");
    c.set("googleUserId", payload.sub);
  } catch {
    c.header("WWW-Authenticate", 'Bearer realm="api", error="invalid_token"');
    return c.json({ error: "Invalid Google ID token" }, 401);
  }

  await next();
};
