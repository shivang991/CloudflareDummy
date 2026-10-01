import { expect, test } from "vitest";
import { createCollectionSchema, updateCollectionSchema } from "../../src/collections/schemas";

test("collections accept only name and fields and require an update property", () => {
  expect(createCollectionSchema.parse({ name: " Contacts " })).toEqual({
    name: "Contacts",
    fields: [],
  });
  expect(updateCollectionSchema.safeParse({}).success).toBe(false);
  expect(
    updateCollectionSchema.safeParse({ name: "Contacts", user_id: crypto.randomUUID() }).success,
  ).toBe(false);
  expect(
    createCollectionSchema.safeParse({
      name: "Contacts",
      fields: Array(101).fill({ name: "Name", type: "TEXT" }),
    }).success,
  ).toBe(false);
});
