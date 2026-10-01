import { z } from "@hono/zod-openapi";
import { ApiError, uuid } from "../utils/http";
import type { Field } from "../fields/schemas";
import { filtersSchema, type ItemFilter, type ValueInput } from "./schemas";

export const valueColumns = {
  TEXT: "text_value",
  NUMBER: "number_value",
  BOOL: "bool_value",
  DATE: "date_value",
  CATEGORY: "category_option_id",
  USER: "user_id",
  RELATION: "related_item_id",
} as const;

export function validateValue(field: Field, value: unknown) {
  const schemas = {
    TEXT: z.string().max(10000),
    NUMBER: z.number().finite(),
    BOOL: z.boolean(),
    DATE: z.iso.datetime({ offset: true }),
    CATEGORY: uuid,
    USER: uuid,
    RELATION: uuid,
  };
  if (!schemas[field.type].safeParse(value).success)
    throw new ApiError(400, `Invalid ${field.type} value for field ${field.id}`);
  if (field.type === "CATEGORY" && !field.options.some((o) => o.id === value))
    throw new ApiError(400, `Category option does not belong to field ${field.id}`);
}

export function validateValues(fields: Field[], values: ValueInput[]) {
  const definitions = new Map(fields.map((f) => [f.id, f]));
  for (const input of values) {
    const field = definitions.get(input.field_id);
    if (!field) throw new ApiError(400, `Unknown field ${input.field_id} in collection`);
    if (input.value !== null) validateValue(field, input.value);
  }
}

export function parseFilters(raw?: string): ItemFilter[] {
  if (!raw) return [];
  try {
    return filtersSchema.parse(JSON.parse(raw));
  } catch {
    throw new ApiError(400, "filters must be a JSON array of at most 20 valid ItemFilter objects");
  }
}

export function compileFilters(fields: Field[], filters: ItemFilter[], params: unknown[]): string {
  const definitions = new Map(fields.map((f) => [f.id, f]));
  const operators = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;

  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  return filters
    .map((filter) => {
      const field = definitions.get(filter.field_id);
      if (!field) throw new ApiError(400, `Unknown filter field ${filter.field_id}`);
      const fieldParam = bind(field.id);
      const exists = `SELECT 1 FROM crm_field_values v WHERE v.item_id = i.id AND v.field_id = ${fieldParam}`;
      if (filter.op === "is_empty") return `NOT EXISTS (${exists})`;
      if (filter.op === "is_not_empty") return `EXISTS (${exists})`;
      validateValue(field, filter.value);
      const column = valueColumns[field.type];
      if (filter.op === "contains") {
        if (field.type !== "TEXT") throw new ApiError(400, "contains is supported only for TEXT");
        return `EXISTS (${exists} AND strpos(v.${column},${bind(filter.value)}) > 0)`;
      }
      if (!["eq", "ne"].includes(filter.op) && field.type !== "NUMBER" && field.type !== "DATE")
        throw new ApiError(400, "Ordering comparisons require NUMBER or DATE");
      const operator = operators[filter.op];
      return `EXISTS (${exists} AND v.${column} ${operator} ${bind(field.type === "DATE" ? new Date(filter.value as string).toISOString() : filter.value)}${field.type === "DATE" ? "::timestamptz" : ""})`;
    })
    .map((clause) => ` AND ${clause}`)
    .join("");
}
