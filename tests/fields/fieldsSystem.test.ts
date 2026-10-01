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

test("fields are managed under their collection; deleting fields cascades values", async () => {
  const c = await h.collection();
  const root = `/api/collections/${c.id}/fields`;
  const added = await h.request(root, "alice", "POST", { name: "Name", type: "TEXT" });
  expect(added.status).toBe(201);
  const field = added.body.field;
  expect((await h.request(root)).body.fields).toHaveLength(1);
  expect((await h.request(`${root}/${field.id}`)).body.field.type).toBe("TEXT");
  expect((await h.request(`${root}/${field.id}`, "bob")).status).toBe(404);
  expect(
    (await h.request(`${root}/${field.id}`, "alice", "PATCH", { type: "NUMBER" })).status,
  ).toBe(400);
  expect(
    (await h.request(`${root}/${field.id}`, "alice", "PATCH", { name: "Full name" })).body.field
      .name,
  ).toBe("Full name");
  const item = await h.item(c.id, [{ field_id: field.id, value: "Alice" }]);
  expect((await h.request(`${root}/${field.id}`, "alice", "DELETE")).status).toBe(204);
  expect((await h.request(`/api/collections/${c.id}/items/${item.id}`)).body.item.values).toEqual(
    [],
  );
  expect((await h.request(`${root}/${field.id}`)).status).toBe(404);
});

test("CATEGORY config and RELATION targets are validated; metadata is immutable in SQL", async () => {
  const c = await h.collection();
  const root = `/api/collections/${c.id}/fields`;
  expect((await h.request(root, "alice", "POST", { name: "Stage", type: "CATEGORY" })).status).toBe(
    400,
  );
  expect(
    (
      await h.request(root, "alice", "POST", {
        name: "Stage",
        type: "CATEGORY",
        options: [
          { name: "A", default: true },
          { name: "B", default: true },
        ],
      })
    ).status,
  ).toBe(400);
  expect((await h.request(root, "alice", "POST", { name: "Link", type: "RELATION" })).status).toBe(
    400,
  );
  const added = await h.request(root, "alice", "POST", {
    name: "Stage",
    type: "CATEGORY",
    options: [{ name: "Lead", default: true }, { name: "Customer" }],
  });
  expect(added.status).toBe(201);
  expect(added.body.field.options).toHaveLength(2);
  const id = added.body.field.id;
  expect(
    (await h.request(`${root}/${id}`, "alice", "PATCH", { name: "New", options: [] })).status,
  ).toBe(400);
  await expect(
    h.db.query("UPDATE crm_fields SET type = 'TEXT' WHERE id = $1", [id]),
  ).rejects.toMatchObject({ code: "23514" });
  const other = await h.collection([], "bob");
  expect((await h.request(`/api/collections/${other.id}/fields/${id}`)).status).toBe(404);
});
