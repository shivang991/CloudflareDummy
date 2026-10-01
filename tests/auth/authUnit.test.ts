import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { verifyGoogleIdentity } from "../../src/auth/middleware";
import { createApp } from "../../src/index";

let privateKey: CryptoKey;
const audience = "test-client.apps.googleusercontent.com";
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }] }),
    ),
  );
});
afterAll(() => vi.unstubAllGlobals());

async function token(claims: JWTPayload = {}, key = privateKey) {
  return new SignJWT({
    sub: "google-123",
    email: "ALICE@example.com",
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .sign(key);
}

test("Google token verification validates the signature and normalizes verified email", async () => {
  expect(await verifyGoogleIdentity(await token(), audience)).toEqual({
    sub: "google-123",
    email: "alice@example.com",
  });
});

test.each([
  { aud: "wrong-client" },
  { iss: "https://attacker.example" },
  { exp: 1 },
  { email_verified: false },
  { email_verified: "true" },
  { sub: "" },
  { email: "not-email" },
  { exp: undefined },
])("rejects invalid identity claims: %j", async (claims) => {
  await expect(verifyGoogleIdentity(await token(claims), audience)).rejects.toThrow();
});

test("rejects unsigned, malformed and incorrectly signed tokens", async () => {
  const wrongKey = (await generateKeyPair("RS256")).privateKey;
  await expect(verifyGoogleIdentity(await token({}, wrongKey), audience)).rejects.toThrow();
  await expect(verifyGoogleIdentity("not-a-jwt", audience)).rejects.toThrow();
});

test("public endpoints and invalid tokens do not initialize a database connection", async () => {
  const database = vi.fn();
  const app = createApp({ database });
  const env = { DATABASE_URL: "unused", GOOGLE_CLIENT_ID: audience };
  expect((await app.request("/health", {}, env)).status).toBe(200);
  expect((await app.request("/openapi.json", {}, env)).status).toBe(200);
  for (const authorization of [
    "",
    "Basic abc",
    "Bearer not-a-token",
    `Bearer ${await token({ email_verified: false })}`,
  ]) {
    const response = await app.request("/api/users/me", { headers: { authorization } }, env);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  }
  expect(database).not.toHaveBeenCalled();
});
