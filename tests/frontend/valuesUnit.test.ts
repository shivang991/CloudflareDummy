import { describe, expect, it } from "vitest";
import { draftValues, serializeValues, scalarValue } from "../../frontend/lib/values";
import type { Field, Item } from "../../frontend/lib/types";

const fields: Field[] = ["TEXT", "NUMBER", "BOOL", "DATE", "CATEGORY", "USER", "RELATION"].map(
  (type, i) => ({
    id: `field-${i}`,
    collection_id: "collection",
    name: type,
    type: type as Field["type"],
    relation_collection_id: null,
    options: [],
  }),
);
const item: Item = {
  id: "item",
  collection_id: "collection",
  created_at: "",
  updated_at: "",
  values: fields.slice(0, 4).map((field) => ({
    id: field.id,
    field_id: field.id,
    type: field.type,
    value: (
      { TEXT: "", NUMBER: 0, BOOL: false, DATE: "2026-10-01T11:23:45.123Z" } as Record<
        string,
        string | number | boolean
      >
    )[field.type]!,
  })),
};

describe("record editor values", () => {
  it("preserves empty text, zero, false, and timestamp precision without unnecessary updates", () => {
    const drafts = draftValues(fields, item);
    expect(drafts["field-0"]?.mode).toBe("value");
    expect(drafts["field-1"]?.value).toBe("0");
    expect(drafts["field-2"]?.value).toBe(false);
    expect(serializeValues(fields, drafts, item)).toEqual([]);
  });
  it("distinguishes category defaults, explicit empty values, and typed input", () => {
    const drafts = draftValues(fields);
    expect(serializeValues(fields, drafts)).toEqual([]);
    drafts["field-0"] = { mode: "value", value: "" };
    drafts["field-1"] = { mode: "value", value: "12.5" };
    drafts["field-2"] = { mode: "value", value: false };
    drafts["field-4"] = { mode: "clear", value: "" };
    expect(serializeValues(fields, drafts)).toEqual([
      { field_id: "field-0", value: "" },
      { field_id: "field-1", value: 12.5 },
      { field_id: "field-2", value: false },
      { field_id: "field-4", value: null },
    ]);
  });
  it("patches only changed fields and sends null to clear existing values", () => {
    const drafts = draftValues(fields, item);
    drafts["field-1"] = { mode: "clear", value: "0" };
    drafts["field-0"] = { mode: "value", value: "Updated" };
    expect(serializeValues(fields, drafts, item)).toEqual([
      { field_id: "field-0", value: "Updated" },
      { field_id: "field-1", value: null },
    ]);
  });
  it("rejects blank or nonfinite numbers and invalid dates", () => {
    for (const value of ["", " ", "Infinity", "NaN"])
      expect(() => scalarValue(fields[1]!, value)).toThrow("valid number");
    expect(() => scalarValue(fields[3]!, "bad-date")).toThrow("valid date");
  });
});
