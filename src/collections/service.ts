import type { Database } from "../utils/database";
import { collectionsRepository } from "./repository";
import { ApiError } from "../utils/http";
import type { z } from "@hono/zod-openapi";
import type { updateCollectionSchema } from "./schemas";

export async function requireCollection(db: Database, id: string, owner: string) {
  const collection = await collectionsRepository(db).get(id, owner);
  if (!collection) throw new ApiError(404, "Collection not found");
  return collection;
}

export async function updateCollection(
  db: Database,
  id: string,
  owner: string,
  input: z.infer<typeof updateCollectionSchema>,
) {
  const collection = await requireCollection(db, id, owner);
  if (input.fields) {
    const existing = new Set(collection.fields.map((f) => f.id));
    if (
      [...input.fields.delete, ...input.fields.rename.map((f) => f.id)].some(
        (id) => !existing.has(id),
      )
    )
      throw new ApiError(404, "Field not found in collection");
  }
  const updated = await collectionsRepository(db).update(id, owner, input);
  if (!updated) throw new ApiError(404, "Collection not found");
  return updated;
}
