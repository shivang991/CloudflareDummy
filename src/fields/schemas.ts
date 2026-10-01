import { z } from "@hono/zod-openapi";
import { name, uuid } from "../utils/http";

export const fieldTypes = [
  "TEXT",
  "NUMBER",
  "BOOL",
  "DATE",
  "CATEGORY",
  "USER",
  "RELATION",
] as const;

export const optionInputSchema = z.strictObject({ name, default: z.boolean().default(false) });

export const createFieldSchema = z
  .strictObject({
    name,
    type: z.enum(fieldTypes),
    options: z.array(optionInputSchema).min(1).max(100).optional(),
    relation_collection_id: uuid.optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });

    if (v.type === "CATEGORY") {
      if (!v.options) issue("CATEGORY requires options");
      if ((v.options?.filter((o) => o.default).length ?? 0) > 1)
        issue("At most one default option is allowed");
      if (new Set(v.options?.map((o) => o.name)).size !== v.options?.length)
        issue("Option names must be unique");
    } else if (v.options !== undefined) issue("Only CATEGORY accepts options");
    if (v.type === "RELATION" && !v.relation_collection_id)
      issue("RELATION requires relation_collection_id");
    if (v.type !== "RELATION" && v.relation_collection_id !== undefined)
      issue("Only RELATION accepts relation_collection_id");
  })
  .openapi("CreateField");

export type CreateField = z.infer<typeof createFieldSchema>;

export const renameFieldSchema = z.strictObject({ name });

export const optionSchema = z
  .object({ id: uuid, field_id: uuid, name: z.string(), default: z.boolean() })
  .openapi("CategoryOption");

export const fieldSchema = z
  .object({
    id: uuid,
    collection_id: uuid,
    name: z.string(),
    type: z.enum(fieldTypes),
    relation_collection_id: uuid.nullable(),
    options: z.array(optionSchema),
  })
  .openapi("Field");

export type Field = z.infer<typeof fieldSchema>;

export const fieldChangesSchema = z
  .strictObject({
    add: z.array(createFieldSchema).max(100).default([]),
    rename: z
      .array(z.strictObject({ id: uuid, name }))
      .max(100)
      .default([]),
    delete: z.array(uuid).max(100).default([]),
  })
  .superRefine((v, ctx) => {
    const ids = [...v.rename.map((f) => f.id), ...v.delete];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "A field may appear only once in a change set" });
  });
