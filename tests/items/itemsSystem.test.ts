import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createHarness, type Harness } from "../utils/harness";
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
beforeEach(async () => {
  await h.reset();
});
afterAll(async () => {
  await h.pg.close();
});

async function fixture() {
  const target = await h.collection([], "alice", "Companies");
  const related = await h.item(target.id);
  const c = await h.collection([
    { name: "Name", type: "TEXT" },
    { name: "Revenue", type: "NUMBER" },
    { name: "Active", type: "BOOL" },
    { name: "Followup", type: "DATE" },
    {
      name: "Status",
      type: "CATEGORY",
      options: [{ name: "Lead", default: true }, { name: "Customer" }],
    },
    { name: "Owner", type: "USER" },
    { name: "Company", type: "RELATION", relation_collection_id: target.id },
  ]);
  const fields = Object.fromEntries(c.fields.map((f) => [f.type, f]));
  const values = [
    { field_id: fields.TEXT.id, value: "Acme_100%" },
    { field_id: fields.NUMBER.id, value: 12.5 },
    { field_id: fields.BOOL.id, value: false },
    { field_id: fields.DATE.id, value: "2026-10-01T10:00:00-07:00" },
    { field_id: fields.CATEGORY.id, value: fields.CATEGORY.options[1].id },
    { field_id: fields.USER.id, value: h.users.alice.id },
    { field_id: fields.RELATION.id, value: related.id },
  ];
  const item = await h.item(c.id, values);
  return { c, fields, item, related, target, values, path: `/api/collections/${c.id}/items` };
}

test("items support all seven typed values and atomic partial updates", async () => {
  const f = await fixture();
  const fetched = await h.request(`${f.path}/${f.item.id}`);
  expect(fetched.body.item.values).toHaveLength(7);
  expect(fetched.body.item.values.find((v: { type: string }) => v.type === "DATE").value).toBe(
    "2026-10-01T17:00:00.000Z",
  );
  expect(fetched.body.item.values.find((v: { type: string }) => v.type === "BOOL").value).toBe(
    false,
  );
  const changed = await h.request(`${f.path}/${f.item.id}`, "alice", "PATCH", {
    values: [
      { field_id: f.fields.NUMBER.id, value: 0 },
      { field_id: f.fields.TEXT.id, value: null },
    ],
  });
  expect(changed.status).toBe(200);
  expect(changed.body.item.values).toHaveLength(6);
  expect(changed.body.item.values.find((v: { type: string }) => v.type === "NUMBER").value).toBe(0);
  // First write must roll back when the later USER foreign key fails at commit.
  const failed = await h.request(`${f.path}/${f.item.id}`, "alice", "PATCH", {
    values: [
      { field_id: f.fields.NUMBER.id, value: 100 },
      { field_id: f.fields.USER.id, value: crypto.randomUUID() },
    ],
  });
  expect(failed.status).toBe(409);
  const unchanged = await h.request(`${f.path}/${f.item.id}`);
  expect(unchanged.body.item.values.find((v: { type: string }) => v.type === "NUMBER").value).toBe(
    0,
  );
  expect((await h.request(`${f.path}/${f.item.id}`, "alice", "DELETE")).status).toBe(204);
  expect((await h.request(`${f.path}/${f.item.id}`)).status).toBe(404);
});

test("filtering executes real SQL for every field type, combinations and empty values", async () => {
  const f = await fixture();
  const empty = await h.item(f.c.id, [{ field_id: f.fields.CATEGORY.id, value: null }]);

  async function matches(filters: unknown[]) {
    const result = await h.request(
      `${f.path}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
    );
    expect(result.status).toBe(200);
    return result.body.items.map((i: { id: string }) => i.id);
  }

  for (const value of f.values)
    expect(await matches([{ ...value, op: "eq" }])).toEqual([f.item.id]);
  for (const [op, value] of [
    ["gt", 12],
    ["gte", 12.5],
    ["lt", 13],
    ["lte", 12.5],
  ] as const)
    expect(await matches([{ field_id: f.fields.NUMBER.id, op, value }])).toEqual([f.item.id]);
  expect(
    await matches([{ field_id: f.fields.DATE.id, op: "gte", value: "2026-10-01T17:00:00Z" }]),
  ).toEqual([f.item.id]);
  expect(await matches([{ field_id: f.fields.TEXT.id, op: "contains", value: "_100%" }])).toEqual([
    f.item.id,
  ]);
  expect(await matches([{ field_id: f.fields.TEXT.id, op: "contains", value: "acme" }])).toEqual(
    [],
  );
  expect(await matches([{ field_id: f.fields.NUMBER.id, op: "ne", value: 0 }])).toEqual([
    f.item.id,
  ]);
  expect(await matches([{ field_id: f.fields.TEXT.id, op: "is_empty" }])).toEqual([empty.id]);
  expect(await matches([{ field_id: f.fields.TEXT.id, op: "is_not_empty" }])).toEqual([f.item.id]);
  expect(
    await matches([
      { field_id: f.fields.NUMBER.id, op: "gt", value: 10 },
      { field_id: f.fields.BOOL.id, op: "eq", value: false },
    ]),
  ).toEqual([f.item.id]);
  expect(
    await matches([
      { field_id: f.fields.NUMBER.id, op: "gt", value: 100 },
      { field_id: f.fields.BOOL.id, op: "eq", value: false },
    ]),
  ).toEqual([]);
  const page = await h.request(`${f.path}?limit=1`);
  expect(page.body.items).toHaveLength(1);
  expect(page.body.page.has_more).toBe(true);
  expect((await h.request(`${f.path}?limit=1&offset=1`)).body.items[0].id).not.toBe(
    page.body.items[0].id,
  );
});

test("category defaults apply at creation only and explicit null suppresses a default", async () => {
  const f = await fixture();
  const defaults = await h.item(f.c.id);
  expect(defaults.values).toHaveLength(1);
  expect(defaults.values[0].value).toBe(f.fields.CATEGORY.options[0].id);
  const cleared = await h.request(`${f.path}/${defaults.id}`, "alice", "PATCH", {
    values: [{ field_id: f.fields.CATEGORY.id, value: null }],
  });
  expect(cleared.body.item.values).toEqual([]);
  const noDefault = await h.item(f.c.id, [{ field_id: f.fields.CATEGORY.id, value: null }]);
  expect(noDefault.values).toEqual([]);
});

test("rejects invalid types, filters, references and cross-account access", async () => {
  const f = await fixture();
  for (const [field, value] of [
    [f.fields.NUMBER, "12"],
    [f.fields.BOOL, 1],
    [f.fields.DATE, "2026-02-30T00:00:00Z"],
    [f.fields.CATEGORY, crypto.randomUUID()],
    [f.fields.USER, "not-an-id"],
  ] as const)
    expect(
      (await h.request(f.path, "alice", "POST", { values: [{ field_id: field.id, value }] }))
        .status,
    ).toBe(400);
  expect(
    (
      await h.request(f.path, "alice", "POST", {
        values: [{ field_id: crypto.randomUUID(), value: null }],
      })
    ).status,
  ).toBe(400);
  expect(
    (await h.request(f.path, "alice", "POST", { values: [f.values[0], f.values[0]] })).status,
  ).toBe(400);
  expect((await h.request(`${f.path}?filters=not-json`)).status).toBe(400);
  for (const filter of [
    { field_id: f.fields.BOOL.id, op: "gt", value: false },
    { field_id: f.fields.NUMBER.id, op: "contains", value: 12 },
    { field_id: f.fields.TEXT.id, op: "eq", value: null },
    { field_id: crypto.randomUUID(), op: "is_empty" },
  ])
    expect(
      (await h.request(`${f.path}?filters=${encodeURIComponent(JSON.stringify([filter]))}`)).status,
    ).toBe(400);
  expect((await h.request(`${f.path}/${f.item.id}`, "bob")).status).toBe(404);
  expect(
    (await h.request(`${f.path}/${f.item.id}`, "bob", "PATCH", { values: [f.values[0]] })).status,
  ).toBe(404);
  expect((await h.request(`${f.path}/${f.item.id}`, "bob", "DELETE")).status).toBe(404);
  expect((await h.request(`${f.path}?actAs=${h.users.alice.id}`, "bob")).status).toBe(403);
  expect((await h.request(`${f.path}?actAs=${h.users.alice.id}`, "admin")).body.items).toHaveLength(
    1,
  );
  const foreign = await h.collection([], "bob");
  const foreignItem = await h.item(foreign.id, [], "bob");
  expect(
    (
      await h.request(f.path, "alice", "POST", {
        values: [{ field_id: f.fields.RELATION.id, value: foreignItem.id }],
      })
    ).status,
  ).toBe(409);
  expect((await h.request(f.path)).body.items).toHaveLength(1);
  // An item in the wrong collection is also forbidden, even under the same account.
  const wrong = await h.item(f.c.id);
  expect(
    (
      await h.request(f.path, "alice", "POST", {
        values: [{ field_id: f.fields.RELATION.id, value: wrong.id }],
      })
    ).status,
  ).toBe(409);
});

test("reference deletes conflict until cleared, while account deletion cascades its graph", async () => {
  const f = await fixture();
  const relatedPath = `/api/collections/${f.target.id}/items/${f.related.id}`;
  expect((await h.request(relatedPath, "alice", "DELETE")).status).toBe(409);
  expect((await h.request(`/api/collections/${f.target.id}`, "alice", "DELETE")).status).toBe(409);
  await h.request(`${f.path}/${f.item.id}`, "alice", "PATCH", {
    values: [{ field_id: f.fields.RELATION.id, value: null }],
  });
  expect((await h.request(relatedPath, "alice", "DELETE")).status).toBe(204);
  expect((await h.request(`/api/users/${h.users.alice.id}`, "admin", "DELETE")).status).toBe(204);
  expect(await h.db.query("SELECT * FROM crm_items")).toEqual([]);
  expect(await h.db.query("SELECT * FROM crm_field_values")).toEqual([]);
});

test("long text is supported and SQL injection payloads remain literal values", async () => {
  const c = await h.collection([{ name: "Text", type: "TEXT" }]);
  const field = c.fields[0];
  const payload = "' OR true; DROP TABLE crm_users; --";
  const a = await h.item(c.id, [{ field_id: field.id, value: payload }]);
  await h.item(c.id, [{ field_id: field.id, value: "x".repeat(10000) }]);
  const filter = encodeURIComponent(
    JSON.stringify([{ field_id: field.id, op: "eq", value: payload }]),
  );
  const listed = await h.request(`/api/collections/${c.id}/items?filters=${filter}`);
  expect(listed.body.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
  expect((await h.db.query("SELECT * FROM crm_users")).length).toBe(3);
});

test("admin performs item and field CRUD within an explicitly selected account", async () => {
  const c = await h.collection();
  const scope = `?actAs=${h.users.alice.id}`;
  const fieldsPath = `/api/collections/${c.id}/fields`;
  const field = (
    await h.request(`${fieldsPath}${scope}`, "admin", "POST", { name: "Name", type: "TEXT" })
  ).body.field;
  expect(
    (await h.request(`${fieldsPath}/${field.id}${scope}`, "admin", "PATCH", { name: "Full name" }))
      .status,
  ).toBe(200);
  const itemsPath = `/api/collections/${c.id}/items`;
  const created = await h.request(`${itemsPath}${scope}`, "admin", "POST", {
    values: [{ field_id: field.id, value: "Admin-created" }],
  });
  expect(created.status).toBe(201);
  const item = created.body.item;
  expect((await h.request(`${itemsPath}/${item.id}${scope}`, "admin")).status).toBe(200);
  expect(
    (
      await h.request(`${itemsPath}/${item.id}${scope}`, "admin", "PATCH", {
        values: [{ field_id: field.id, value: "Updated" }],
      })
    ).body.item.values[0].value,
  ).toBe("Updated");
  expect((await h.request(`${itemsPath}/${item.id}${scope}`, "admin", "DELETE")).status).toBe(204);
  expect((await h.request(`${fieldsPath}/${field.id}${scope}`, "admin", "DELETE")).status).toBe(
    204,
  );
});

test("database constraints reject wrong collection/type/category even without API validation", async () => {
  const a = await h.collection([
    { name: "Name", type: "TEXT" },
    { name: "Stage", type: "CATEGORY", options: [{ name: "A" }] },
  ]);
  const b = await h.collection([{ name: "Stage", type: "CATEGORY", options: [{ name: "B" }] }]);
  const i = await h.item(a.id);
  const text = a.fields.find((f) => f.type === "TEXT")!;
  const category = a.fields.find((f) => f.type === "CATEGORY")!;
  const foreignOption = b.fields[0].options[0].id;
  await expect(
    h.db.query(
      "INSERT INTO crm_field_values (id,item_id,collection_id,field_id,type,text_value) VALUES ($1,$2,$3,$4,'TEXT','x')",
      [crypto.randomUUID(), i.id, b.id, text.id],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    h.db.query(
      "INSERT INTO crm_field_values (id,item_id,collection_id,field_id,type,number_value) VALUES ($1,$2,$3,$4,'NUMBER',2)",
      [crypto.randomUUID(), i.id, a.id, text.id],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    h.db.query(
      "INSERT INTO crm_field_values (id,item_id,collection_id,field_id,type,category_option_id) VALUES ($1,$2,$3,$4,'CATEGORY',$5)",
      [crypto.randomUUID(), i.id, a.id, category.id, foreignOption],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    h.db.query(
      "INSERT INTO crm_field_values (id,item_id,collection_id,field_id,type,text_value,number_value) VALUES ($1,$2,$3,$4,'TEXT','x',2)",
      [crypto.randomUUID(), i.id, a.id, text.id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
});
