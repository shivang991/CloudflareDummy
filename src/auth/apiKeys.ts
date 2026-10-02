import { createRoute, z } from "@hono/zod-openapi";
import type { Database } from "../utils/database";
import type { User } from "./schemas";
import {
  ApiError,
  body,
  content,
  errors,
  name,
  pagination,
  pageSchema,
  requireJson,
  router,
  security,
  uuid,
} from "../utils/http";
import { requireUser } from "./service";

export const apiKeyPattern = /^crm_[a-f0-9]{64}$/;

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function hashApiKey(key: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))));
}

const apiKeySchema = z
  .object({
    id: uuid,
    user_id: uuid,
    name,
    key_prefix: z.string(),
    created_at: z.string(),
  })
  .openapi("ApiKey");

export type ApiKey = z.infer<typeof apiKeySchema>;

const columns = "id, user_id, name, key_prefix, created_at";

export function apiKeysRepository(db: Database) {
  return {
    async create(userId: string, keyName: string) {
      const key = `crm_${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
      const [apiKey] = await db.query<ApiKey>(
        `INSERT INTO crm_api_keys (id,user_id,name,key_prefix,key_hash)
         VALUES ($1,$2,$3,$4,$5) RETURNING ${columns}`,
        [crypto.randomUUID(), userId, keyName, key.slice(0, 16), await hashApiKey(key)],
      );
      return { api_key: apiKey, key };
    },
    list: (userId: string, limit: number, offset: number) =>
      db.query<ApiKey>(
        `SELECT ${columns} FROM crm_api_keys WHERE user_id = $1
         ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
    async resolve(key: string) {
      const [user] = await db.query<User>(
        `SELECT u.id, u.email, u.profile, u.role, u.created_at, u.updated_at
         FROM crm_api_keys k JOIN crm_users u ON u.id = k.user_id WHERE k.key_hash = $1`,
        [await hashApiKey(key)],
      );
      return user ?? null;
    },
    async delete(id: string, userId: string) {
      return (
        (
          await db.query("DELETE FROM crm_api_keys WHERE id = $1 AND user_id = $2 RETURNING id", [
            id,
            userId,
          ])
        ).length > 0
      );
    },
  };
}

export function apiKeyRoutes() {
  const app = router();
  app.use("/api-keys", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.openapi(
    createRoute({
      method: "post",
      path: "/api-keys",
      tags: ["Auth"],
      summary: "Create an API key for your account",
      description:
        "Requires Google authentication. The secret key is returned only once. Grants item CRUD and collection reads within your account; cannot use actAs or manage keys, users, collections, or fields.",
      security,
      middleware: [requireJson],
      request: { body: body(z.strictObject({ name })) },
      responses: {
        201: {
          description: "API key metadata and one-time secret",
          content: content(z.object({ api_key: apiKeySchema, key: z.string() })),
        },
        ...errors,
      },
    }),
    async (c) => {
      const result = await apiKeysRepository(c.get("db")).create(
        requireUser(c).id,
        c.req.valid("json").name,
      );
      c.header("Location", `/api/api-keys/${result.api_key.id}`);
      return c.json(result, 201);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api-keys",
      tags: ["Auth"],
      summary: "List your API keys without their secrets",
      security,
      request: { query: z.strictObject(pagination) },
      responses: {
        200: {
          description: "Paginated API key metadata",
          content: content(z.object({ api_keys: z.array(apiKeySchema), page: pageSchema })),
        },
        ...errors,
      },
    }),
    async (c) => {
      const { limit, offset } = c.req.valid("query");
      const rows = await apiKeysRepository(c.get("db")).list(requireUser(c).id, limit + 1, offset);
      return c.json(
        { api_keys: rows.slice(0, limit), page: { limit, offset, has_more: rows.length > limit } },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api-keys/{keyId}",
      tags: ["Auth"],
      summary: "Revoke one of your API keys",
      security,
      request: { params: z.object({ keyId: uuid }) },
      responses: { 204: { description: "API key revoked" }, ...errors },
    }),
    async (c) => {
      if (
        !(await apiKeysRepository(c.get("db")).delete(
          c.req.valid("param").keyId,
          requireUser(c).id,
        ))
      )
        throw new ApiError(404, "API key not found");
      return c.body(null, 204);
    },
  );
  return app;
}
