import type { Database, Statement } from "../utils/database";
import type { Collection } from "./schemas";
import { addFieldStatements, fieldsRepository } from "../fields/repository";
import type { z } from "@hono/zod-openapi";
import type { createCollectionSchema, updateCollectionSchema } from "./schemas";

const columns = "id,user_id,name,created_at,updated_at";

export const collectionLock = (id: string, owner: string): Statement => ({
  text: "SELECT id FROM crm_collections WHERE id = $1 AND user_id = $2 FOR UPDATE",
  params: [id, owner],
});

export function collectionsRepository(db: Database) {
  const fields = fieldsRepository(db);

  const get = async (id: string, owner: string): Promise<Collection | null> => {
    const row = (
      await db.query<Omit<Collection, "fields">>(
        `SELECT ${columns} FROM crm_collections WHERE id = $1 AND user_id = $2`,
        [id, owner],
      )
    )[0];
    return row ? { ...row, fields: await fields.list(id, owner) } : null;
  };

  return {
    get,
    async list(owner: string, limit: number, offset: number) {
      const rows = await db.query<Omit<Collection, "fields">>(
        `SELECT ${columns} FROM crm_collections WHERE user_id = $1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,
        [owner, limit, offset],
      );
      const definitions = rows.length
        ? await fields.listMany(
            rows.map((row) => row.id),
            owner,
          )
        : [];
      return rows.map((row) => ({
        ...row,
        fields: definitions.filter((field) => field.collection_id === row.id),
      }));
    },
    async create(owner: string, input: z.infer<typeof createCollectionSchema>) {
      const id = crypto.randomUUID();
      await db.transaction([
        {
          text: "INSERT INTO crm_collections (id,user_id,name) VALUES ($1,$2,$3)",
          params: [id, owner, input.name],
        },
        ...input.fields.flatMap((f) => addFieldStatements(id, owner, f)),
      ]);
      return (await get(id, owner))!;
    },
    async update(id: string, owner: string, input: z.infer<typeof updateCollectionSchema>) {
      const statements: Statement[] = [
        collectionLock(id, owner),
        {
          text: "UPDATE crm_collections SET name = COALESCE($3,name), updated_at = now() WHERE id = $1 AND user_id = $2",
          params: [id, owner, input.name ?? null],
        },
      ];
      const changes = input.fields;
      if (changes) {
        // Delete/rename before adding permits replacing a field with the same name.
        for (const fieldId of changes.delete)
          statements.push({
            text: "DELETE FROM crm_fields WHERE id = $1 AND collection_id = $2 AND user_id = $3",
            params: [fieldId, id, owner],
          });
        for (const f of changes.rename)
          statements.push({
            text: "UPDATE crm_fields SET name = $4 WHERE id = $1 AND collection_id = $2 AND user_id = $3",
            params: [f.id, id, owner, f.name],
          });
        statements.push(...changes.add.flatMap((f) => addFieldStatements(id, owner, f)));
      }
      await db.transaction(statements);
      return get(id, owner);
    },
    async delete(id: string, owner: string) {
      return (
        (
          await db.query(
            "DELETE FROM crm_collections WHERE id = $1 AND user_id = $2 RETURNING id",
            [id, owner],
          )
        ).length > 0
      );
    },
  };
}
