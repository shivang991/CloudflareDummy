import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../../src/index";
import type { Database } from "../../src/utils/database";
import type { Identity, User } from "../../src/auth/schemas";
import type { Collection } from "../../src/collections/schemas";
import type { Item } from "../../src/items/schemas";

export const identities: Record<string, Identity> = {
  admin: { sub: "google-admin", email: "admin@example.com" },
  alice: { sub: "google-alice", email: "alice@example.com" },
  bob: { sub: "google-bob", email: "bob@example.com" },
  newcomer: { sub: "google-newcomer", email: "new@example.com" },
};

export const env = { DATABASE_URL: "postgresql://test", GOOGLE_CLIENT_ID: "test-client" };

export async function createHarness() {
  const pg = new PGlite();
  const schema = await readFile(new URL("../../schema.sql", import.meta.url), "utf8");
  await pg.exec(schema);
  const db: Database = {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
    transaction: (statements) =>
      pg.transaction(async (tx) => {
        const results: unknown[][] = [];
        for (const s of statements) results.push((await tx.query(s.text, s.params)).rows);
        return results;
      }),
  };
  const app = createApp({
    database: () => db,
    verifyIdentity: async (token) => {
      if (!identities[token]) throw new Error("Bad token");
      return identities[token];
    },
  });

  async function request(path: string, actor = "alice", method = "GET", input?: unknown) {
    const headers: Record<string, string> = { authorization: `Bearer ${actor}` };
    if (input !== undefined) headers["content-type"] = "application/json";
    const response = await app.request(
      path,
      { method, headers, body: input === undefined ? undefined : JSON.stringify(input) },
      env,
    );
    return {
      response,
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }

  const users = {} as Record<"admin" | "alice" | "bob", User>;

  async function reset() {
    await pg.exec("TRUNCATE crm_users CASCADE");
    for (const actor of ["admin", "alice", "bob"] as const) {
      users[actor] = (
        await db.query<User>(
          `INSERT INTO crm_users (id,email,google_sub,role) VALUES ($1,$2,$3,$4) RETURNING *`,
          [
            crypto.randomUUID(),
            identities[actor].email,
            identities[actor].sub,
            actor === "admin" ? "ADMIN" : "USER",
          ],
        )
      )[0];
    }
  }

  async function collection(
    fields: unknown[] = [],
    actor = "alice",
    name = "Contacts",
  ): Promise<Collection> {
    const result = await request("/api/collections", actor, "POST", { name, fields });
    if (result.status !== 201)
      throw new Error(`Collection creation failed: ${JSON.stringify(result.body)}`);
    return result.body.collection;
  }

  async function item(
    collectionId: string,
    values: unknown[] = [],
    actor = "alice",
  ): Promise<Item> {
    const result = await request(`/api/collections/${collectionId}/items`, actor, "POST", {
      values,
    });
    if (result.status !== 201)
      throw new Error(`Item creation failed: ${JSON.stringify(result.body)}`);
    return result.body.item;
  }

  return { pg, db, app, request, users, reset, collection, item, schema };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
