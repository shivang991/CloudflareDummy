import { z } from "@hono/zod-openapi";
import { name, uuid } from "../utils/http";
import { createFieldSchema, fieldChangesSchema, fieldSchema } from "../fields/schemas";

export const collectionSchema = z
  .object({
    id: uuid,
    user_id: uuid,
    name: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    fields: z.array(fieldSchema),
  })
  .openapi("Collection");

export type Collection = z.infer<typeof collectionSchema>;

export const createCollectionSchema = z.strictObject({
  name,
  fields: z.array(createFieldSchema).max(100).default([]),
});

export const updateCollectionSchema = z
  .strictObject({ name: name.optional(), fields: fieldChangesSchema.optional() })
  .refine((v) => v.name !== undefined || v.fields !== undefined, "Provide name or fields");

export const collectionParams = z.object({ collectionId: uuid });
