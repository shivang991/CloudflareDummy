import type { Field, Item, ValueInput } from "./types";

export interface ValueDraft {
  mode: "omit" | "value" | "clear";
  value: string | boolean;
}

export function toLocalDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
}

export function draftValues(fields: Field[], item?: Item): Record<string, ValueDraft> {
  return Object.fromEntries(
    fields.map((field) => {
      const stored = item?.values.find((value) => value.field_id === field.id)?.value;
      return [
        field.id,
        {
          mode: stored !== undefined && stored !== null ? "value" : item ? "clear" : "omit",
          value:
            stored !== undefined && stored !== null
              ? field.type === "DATE"
                ? toLocalDate(String(stored))
                : field.type === "BOOL"
                  ? stored === true
                  : String(stored)
              : field.type === "BOOL"
                ? false
                : "",
        },
      ];
    }),
  );
}

export function scalarValue(field: Field, value: string | boolean): string | number | boolean {
  if (field.type === "BOOL") return value === true || value === "true";
  if (field.type === "NUMBER") {
    if (String(value).trim() === "" || !Number.isFinite(Number(value)))
      throw new Error(`${field.name}: enter a valid number.`);
    return Number(value);
  }
  if (field.type === "DATE") {
    const date = new Date(String(value));
    if (!String(value).trim() || !Number.isFinite(date.getTime()))
      throw new Error(`${field.name}: enter a valid date and time.`);
    return date.toISOString();
  }
  if (["CATEGORY", "USER", "RELATION"].includes(field.type) && !String(value))
    throw new Error(`${field.name}: choose a value.`);
  return String(value);
}

export function serializeValues(
  fields: Field[],
  drafts: Record<string, ValueDraft>,
  item?: Item,
): ValueInput[] {
  const values: ValueInput[] = [];
  for (const field of fields) {
    const draft = drafts[field.id];
    if (!draft || draft.mode === "omit") continue;
    const value = draft.mode === "clear" ? null : scalarValue(field, draft.value);
    const original = item?.values.find((entry) => entry.field_id === field.id)?.value ?? null;
    if (!item || value !== original) values.push({ field_id: field.id, value });
  }
  return values;
}

export function displayValue(field: Field, item: Item): string {
  const value = item.values.find((entry) => entry.field_id === field.id)?.value;
  if (value === undefined || value === null) return "—";
  if (field.type === "CATEGORY")
    return field.options.find((option) => option.id === value)?.name ?? String(value);
  if (field.type === "BOOL") return value ? "Yes" : "No";
  if (field.type === "DATE") return new Date(String(value)).toLocaleString();
  return String(value);
}
