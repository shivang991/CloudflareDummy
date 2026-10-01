import { expect, test } from "vitest";
import { compileFilters, parseFilters, validateValues } from "../../src/items/service";
import { createItemSchema, updateItemSchema } from "../../src/items/schemas";
import type { Field } from "../../src/fields/schemas";

const field: Field = {
  id: crypto.randomUUID(),
  collection_id: crypto.randomUUID(),
  name: "Text",
  type: "TEXT",
  relation_collection_id: null,
  options: [],
};

test("value input rejects duplicates and unknown fields without coercing values", () => {
  const v = { field_id: field.id, value: "text" };
  expect(createItemSchema.safeParse({ values: [v, v] }).success).toBe(false);
  expect(updateItemSchema.safeParse({ values: [] }).success).toBe(false);
  expect(() => validateValues([field], [{ field_id: crypto.randomUUID(), value: null }])).toThrow(
    "Unknown field",
  );
  expect(() =>
    validateValues([{ ...field, type: "BOOL" }], [{ field_id: field.id, value: "false" }]),
  ).toThrow("Invalid BOOL");
});

test("filter builder parameterizes request values and permits only known operators", () => {
  const value = "' OR 1=1; --";
  const params: unknown[] = [field.collection_id, "owner"];
  const clause = compileFilters(
    [field],
    parseFilters(JSON.stringify([{ field_id: field.id, op: "eq", value }])),
    params,
  );
  expect(clause).not.toContain(value);
  expect(params).toEqual([field.collection_id, "owner", field.id, value]);
  expect(clause).toContain("v.text_value = $4");
  expect(() => parseFilters('[{"field_id":"x","op":"DROP TABLE"}]')).toThrow();
  expect(() =>
    parseFilters(JSON.stringify(Array(21).fill({ field_id: field.id, op: "is_empty" }))),
  ).toThrow();
});
