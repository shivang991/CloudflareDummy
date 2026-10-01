import { z } from "@hono/zod-openapi";
import { pagination, uuid } from "../utils/http";
import { fieldTypes } from "../fields/schemas";

export const scalarSchema = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const valueInputSchema = z
  .strictObject({ field_id: uuid, value: scalarSchema })
  .openapi("FieldValueInput");

export const valuesSchema = z
  .array(valueInputSchema)
  .max(200)
  .refine(
    (values) => new Set(values.map((v) => v.field_id)).size === values.length,
    "Duplicate field_id",
  );

export const createItemSchema = z.strictObject({ values: valuesSchema.default([]) });

export const updateItemSchema = z.strictObject({ values: valuesSchema.min(1) });

export const valueSchema = z
  .object({ id: uuid, field_id: uuid, type: z.enum(fieldTypes), value: scalarSchema })
  .openapi("FieldValue");

export const itemSchema = z
  .object({
    id: uuid,
    collection_id: uuid,
    created_at: z.string(),
    updated_at: z.string(),
    values: z.array(valueSchema),
  })
  .openapi("Item");

export type Item = z.infer<typeof itemSchema>;

export type ValueInput = z.infer<typeof valueInputSchema>;

export const filterSchema = z
  .strictObject({
    field_id: uuid,
    op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "is_empty", "is_not_empty"]),
    value: scalarSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const empty = v.op === "is_empty" || v.op === "is_not_empty";
    if (empty ? v.value !== undefined : v.value === undefined || v.value === null)
      ctx.addIssue({
        code: "custom",
        message: empty
          ? "Empty operators do not accept value"
          : "Operator requires a non-null value",
      });
  })
  .openapi("ItemFilter");

export type ItemFilter = z.infer<typeof filterSchema>;

export const filtersSchema = z.array(filterSchema).max(20);

export const itemListQuery = z.strictObject({
  ...pagination,
  actAs: uuid.optional(),
  filters: z.string().max(16000).optional().openapi({
    description:
      "URL-encoded JSON array of ItemFilter objects, combined with AND. eq/ne work for all types; gt/gte/lt/lte for NUMBER/DATE; contains for TEXT; is_empty/is_not_empty for all types.",
    example: '[{"field_id":"123e4567-e89b-42d3-a456-426614174000","op":"contains","value":"Acme"}]',
  }),
});
