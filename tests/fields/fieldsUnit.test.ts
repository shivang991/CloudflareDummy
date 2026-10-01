import { expect, test } from "vitest";
import { createFieldSchema, fieldChangesSchema, renameFieldSchema } from "../../src/fields/schemas";

test("field definitions trim names and enforce type-specific metadata", () => {
  expect(createFieldSchema.parse({ name: "  Name  ", type: "TEXT" }).name).toBe("Name");
  for (const input of [
    { name: "Status", type: "CATEGORY", options: [] },
    { name: "Status", type: "CATEGORY", options: [{ name: "Lead" }, { name: " Lead " }] },
    { name: "Text", type: "TEXT", options: [{ name: "Option" }] },
    { name: "Text", type: "TEXT", relation_collection_id: crypto.randomUUID() },
    { name: "Link", type: "RELATION" },
    { name: "", type: "BOOL" },
  ])
    expect(createFieldSchema.safeParse(input).success).toBe(false);
});

test("field changes reject duplicate operations and immutable properties", () => {
  const id = crypto.randomUUID();
  expect(
    fieldChangesSchema.safeParse({ rename: [{ id, name: "New" }], delete: [id] }).success,
  ).toBe(false);
  expect(fieldChangesSchema.safeParse({ delete: [id, id] }).success).toBe(false);
  expect(renameFieldSchema.safeParse({ name: "New", type: "NUMBER" }).success).toBe(false);
});
