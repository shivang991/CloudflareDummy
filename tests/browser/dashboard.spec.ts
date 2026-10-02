import { expect, test, type Page } from "@playwright/test";
import type { User, Collection, Item, Field, ApiKey } from "../../frontend/lib/types";

const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, "0")}`;

const timestamp = "2026-10-01T10:00:00.000Z";
const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;

async function mockDashboard(
  page: Page,
  role: User["role"] = "ADMIN",
  extraAccounts = 0,
  extraKeys = 0,
) {
  const admin: User = {
    id: id(1),
    email: "admin@example.com",
    role,
    profile: { name: "Admin" },
    created_at: timestamp,
    updated_at: timestamp,
  };
  const users: User[] = [
    admin,
    {
      ...admin,
      id: id(2),
      email: "alex@example.com",
      role: "USER",
      profile: { name: "Alex Morgan" },
    },
  ];
  for (let i = 0; i < extraAccounts; i++) {
    users.push({
      ...admin,
      id: id(1000 + i),
      email: `person${i}@example.com`,
      role: "USER",
      profile: { name: `Person ${i}` },
    });
  }
  const fields: Field[] = ["TEXT", "NUMBER", "BOOL", "DATE", "CATEGORY", "USER", "RELATION"].map(
    (type, index) => ({
      id: id(index + 10),
      collection_id: id(3),
      name: ["Name", "Revenue", "Active", "Follow up", "Status", "Owner", "Company"][index]!,
      type: type as Field["type"],
      relation_collection_id: type === "RELATION" ? id(4) : null,
      options:
        type === "CATEGORY" ? [{ id: id(20), field_id: id(14), name: "Lead", default: true }] : [],
    }),
  );
  const collections: Collection[] = [
    {
      id: id(3),
      user_id: id(2),
      name: "Contacts",
      created_at: timestamp,
      updated_at: timestamp,
      fields,
    },
    {
      id: id(4),
      user_id: id(2),
      name: "Companies",
      created_at: timestamp,
      updated_at: timestamp,
      fields: [],
    },
  ];
  const items: Item[] = [
    {
      id: id(30),
      collection_id: id(3),
      created_at: timestamp,
      updated_at: timestamp,
      values: [
        { id: id(31), field_id: id(10), type: "TEXT", value: "Taylor Reed" },
        { id: id(32), field_id: id(11), type: "NUMBER", value: 0 },
        { id: id(33), field_id: id(12), type: "BOOL", value: false },
      ],
    },
  ];
  const mutations: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const apiKeys: ApiKey[] = Array.from({ length: extraKeys }, (_, index) => ({
    id: id(2000 + index),
    user_id: admin.id,
    name: `Integration ${index}`,
    key_prefix: "crm_0123456789ab",
    created_at: timestamp,
  }));
  const keySecret = `crm_${"a".repeat(64)}`;
  let nextKeyId = 3000;
  let keyFailure: string | null = null;
  let forceUnauthorized = false;
  let referenceConflict = false;
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{id:{initialize(o){this.callback=o.callback},renderButton(el){const b=document.createElement('button');b.textContent='Sign in with Google';b.onclick=()=>this.callback({credential:${JSON.stringify(token)}});el.append(b)},disableAutoSelect(){}}}};`,
    }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(4);
    const method = request.method();
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    expect(request.headers().cookie).toBeUndefined();
    if (forceUnauthorized) {
      await route.fulfill({ status: 401, json: { error: "Invalid Google ID token" } });
      return;
    }
    if (path.startsWith("/collections")) expect(url.searchParams.get("actAs")).toBe(id(2));
    if (path.startsWith("/api-keys")) {
      expect(url.searchParams.has("actAs")).toBe(false);
      expect(request.headers()["x-api-key"]).toBeUndefined();
      if (keyFailure === method) {
        await route.fulfill({ status: 500, json: { error: "Key service unavailable" } });
        return;
      }
    }
    if (referenceConflict && method === "DELETE" && path.includes("/items/")) {
      await route.fulfill({
        status: 409,
        json: { error: "Record is still referenced by another record" },
      });
      return;
    }
    const body =
      method === "GET" || method === "DELETE"
        ? {}
        : (request.postDataJSON() as Record<string, unknown>);
    if (method !== "GET") mutations.push({ path, method, body });
    const parts = path.split("/").filter(Boolean);

    const paginate = <T>(rows: T[]) => {
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 25);
      return {
        rows: rows.slice(offset, offset + limit),
        page: { offset, limit, has_more: rows.length > offset + limit },
      };
    };

    let result: unknown;
    if (path === "/users/me") result = { user: admin };
    else if (parts[0] === "users") {
      if (method === "POST") {
        const user = { ...admin, id: id(100 + users.length), ...body } as User;
        users.unshift(user);
        result = { user };
      } else if (parts[1]) {
        const user = users.find((u) => u.id === parts[1])!;
        if (method === "PATCH") Object.assign(user, body);
        if (method === "DELETE") users.splice(users.indexOf(user), 1);
        result = { user };
      } else {
        const data = paginate(users);
        result = { users: data.rows, page: data.page };
      }
    } else if (parts[0] === "api-keys") {
      if (method === "POST") {
        const apiKey: ApiKey = {
          id: id(nextKeyId++),
          user_id: admin.id,
          name: String(body.name),
          key_prefix: keySecret.slice(0, 16),
          created_at: timestamp,
        };
        apiKeys.unshift(apiKey);
        result = { api_key: apiKey, key: keySecret };
      } else if (method === "DELETE") {
        const index = apiKeys.findIndex((key) => key.id === parts[1]);
        expect(index).toBeGreaterThanOrEqual(0);
        apiKeys.splice(index, 1);
      } else {
        const data = paginate(apiKeys);
        result = { api_keys: data.rows, page: data.page };
      }
    } else if (parts[0] === "collections") {
      if (parts.length === 1) {
        if (method === "POST") {
          const collection: Collection = {
            id: id(200 + collections.length),
            user_id: id(2),
            name: String(body.name),
            fields: [],
            created_at: timestamp,
            updated_at: timestamp,
          };
          collections.unshift(collection);
          result = { collection };
        } else {
          const data = paginate(collections);
          result = { collections: data.rows, page: data.page };
        }
      } else {
        const collection = collections.find((c) => c.id === parts[1])!;
        if (parts[2] === "fields") {
          if (method === "POST") {
            const field = {
              id: id(300 + collection.fields.length),
              collection_id: collection.id,
              options: [],
              relation_collection_id: null,
              ...body,
              name: String(body.name),
              type: body.type as Field["type"],
            } as Field;
            collection.fields.push(field);
            result = { field };
          } else {
            const field = collection.fields.find((f) => f.id === parts[3])!;
            if (method === "PATCH") Object.assign(field, body);
            if (method === "DELETE") collection.fields.splice(collection.fields.indexOf(field), 1);
            result = { field };
          }
        } else if (parts[2] === "items") {
          if (method === "POST") {
            const item = {
              id: id(400 + items.length),
              collection_id: collection.id,
              created_at: timestamp,
              updated_at: timestamp,
              values: (
                body.values as { field_id: string; value: string | number | boolean | null }[]
              )
                .filter((v) => v.value !== null)
                .map((v) => ({
                  ...v,
                  id: id(500),
                  type: collection.fields.find((f) => f.id === v.field_id)!.type,
                })),
            };
            items.unshift(item);
            result = { item };
          } else if (parts[3]) {
            const item = items.find((i) => i.id === parts[3])!;
            if (method === "PATCH")
              for (const value of body.values as Item["values"]) {
                const prior = item.values.findIndex((v) => v.field_id === value.field_id);
                if (prior >= 0) item.values.splice(prior, 1);
                if (value.value !== null)
                  item.values.push({
                    ...value,
                    id: id(500),
                    type: collection.fields.find((f) => f.id === value.field_id)!.type,
                  });
              }
            if (method === "DELETE") items.splice(items.indexOf(item), 1);
            result = { item };
          } else {
            let selected = items.filter((item) => item.collection_id === collection.id);
            const filters = JSON.parse(url.searchParams.get("filters") ?? "[]") as {
              field_id: string;
              value: unknown;
            }[];
            if (filters.length)
              selected = selected.filter((item) =>
                item.values.some(
                  (v) => v.field_id === filters[0]!.field_id && v.value === filters[0]!.value,
                ),
              );
            const data = paginate(selected);
            result = { items: data.rows, page: data.page };
          }
        } else {
          if (method === "PATCH") Object.assign(collection, body);
          if (method === "DELETE") collections.splice(collections.indexOf(collection), 1);
          result = { collection };
        }
      }
    }
    await route.fulfill(
      method === "DELETE"
        ? { status: 204 }
        : { status: method === "POST" ? 201 : 200, json: result },
    );
  });
  return {
    mutations,
    keySecret,
    failKeys: (method: string | null) => {
      keyFailure = method;
    },
    expire: () => {
      forceUnauthorized = true;
    },
    conflict: (enabled: boolean) => {
      referenceConflict = enabled;
    },
  };
}

test("account administration and session expiry", async ({ page }) => {
  const state = await mockDashboard(page);
  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Google email").fill("new@example.com");
  await page.getByLabel("Name", { exact: true }).fill("New Person");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByRole("link", { name: "New Person", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit new@example.com" }).click();
  await page.getByLabel("Role", { exact: true }).selectOption("ADMIN");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "New Person" }).getByText("ADMIN", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete new@example.com" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("link", { name: "New Person", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh accounts" })).toBeEnabled();
  await page.screenshot({
    path: "test-results/accounts-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  state.expire();
  await page.getByRole("button", { name: "Refresh accounts" }).click();
  await expect(page.getByRole("heading", { name: "Admin workspace" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("session expired");
});

test("collection, field, typed record editing, filtering, and mobile navigation", async ({
  page,
}) => {
  const state = await mockDashboard(page);
  await page.goto(`/admin/accounts/${id(2)}/collections/${id(3)}`);
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await expect(page.getByText("Taylor Reed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New record", exact: true }).click();
  await page.getByLabel("Name value mode").selectOption("value");
  await page.getByLabel("Name", { exact: true }).fill("Jordan Blake");
  await page.getByLabel("Revenue value mode").selectOption("value");
  await page.getByLabel("Revenue", { exact: true }).fill("12.5");
  await page.getByLabel("Active value mode").selectOption("value");
  await page.getByLabel("Active", { exact: true }).selectOption("false");
  await page.getByLabel("Follow up value mode").selectOption("value");
  await page.getByLabel("Follow up", { exact: true }).fill("2026-10-01T09:30:00.123");
  await page.getByLabel("Status value mode").selectOption("value");
  await page.getByLabel("Status", { exact: true }).selectOption(id(20));
  await page.getByLabel("Owner value mode").selectOption("value");
  await page.getByLabel("Owner", { exact: true }).fill(id(2));
  await page.getByLabel("Company value mode").selectOption("clear");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("Jordan Blake", { exact: true })).toBeVisible();
  const creation = state.mutations.find((m) => m.method === "POST" && m.path.endsWith("/items"))!;
  const values = creation.body.values as { field_id: string; value: unknown }[];
  expect(values.find((v) => v.field_id === id(11))?.value).toBe(12.5);
  expect(values.find((v) => v.field_id === id(12))?.value).toBe(false);
  expect(String(values.find((v) => v.field_id === id(13))?.value)).toMatch(/\.123Z$/);
  expect(values.find((v) => v.field_id === id(16))?.value).toBeNull();
  const row = page.getByRole("row").filter({ hasText: "Jordan Blake" });
  await row.getByRole("button", { name: "Edit record" }).click();
  await page.getByLabel("Revenue value mode").selectOption("clear");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    state.mutations.find((m) => m.method === "PATCH" && m.path.includes("/items/"))!.body.values,
  ).toEqual([{ field_id: id(11), value: null }]);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByLabel("Field", { exact: true }).selectOption(id(10));
  await page.getByLabel("Value", { exact: true }).fill("Jordan Blake");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.getByText("Taylor Reed", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filter" }).click();
  await expect(page.getByText("Taylor Reed", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "fields", exact: false })
    .filter({ hasText: /^fields/i })
    .click();
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field name", { exact: true }).fill("Website");
  await page.getByRole("button", { name: "Save field" }).click();
  await expect(page.getByRole("cell", { name: "Website", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rename Website" }).click();
  await page.getByLabel("Field name", { exact: true }).fill("URL");
  await page.getByRole("button", { name: "Save field" }).click();
  await expect(page.getByRole("cell", { name: "URL", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete field URL" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("cell", { name: "URL", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/fields-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: /Alex Morgan \/ Collections/ }).click();
  await page.getByRole("button", { name: "New collection" }).click();
  await page.getByLabel("Collection name").fill("Projects");
  await page.getByRole("button", { name: "Save collection" }).click();
  await expect(page.getByRole("link", { name: "Projects", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rename Projects" }).click();
  await page.getByLabel("Collection name").fill("Work");
  await page.getByRole("button", { name: "Save collection" }).click();
  await expect(page.getByRole("link", { name: "Work", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Work" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("link", { name: "Work", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await expect(page.locator("aside")).toHaveAttribute("inert", "");
  await page.screenshot({
    path: "test-results/accounts-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("reference conflicts keep the delete dialog actionable", async ({ page }) => {
  const state = await mockDashboard(page);
  state.conflict(true);
  await page.goto(`/admin/accounts/${id(2)}/collections/${id(3)}`);
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Taylor Reed" })
    .getByRole("button", { name: "Delete record" })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("alert")).toContainText("still referenced");
  await expect(page.getByText("Taylor Reed", { exact: true })).toBeVisible();
  state.conflict(false);
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Taylor Reed", { exact: true })).toHaveCount(0);
});

test("deleting the last account on a page returns to the previous page", async ({ page }) => {
  await mockDashboard(page, "ADMIN", 24);
  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("link", { name: "Person 23", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete person23@example.com" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("link", { name: "Alex Morgan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
});

test("non-admin accounts are denied", async ({ page }) => {
  await mockDashboard(page, "USER");
  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("alert")).toContainText("requires an admin account");
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toHaveCount(0);
});

test("API keys can be created, copied once, and revoked through mobile navigation", async ({
  page,
}) => {
  const state = await mockDashboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "API keys", exact: true }).click();
  await expect(page.getByRole("heading", { name: "API keys", exact: true })).toBeVisible();
  await expect(page.locator("aside")).toHaveAttribute("inert", "");
  await expect(page.getByText("No API keys yet.", { exact: false })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { copiedSecret?: string }).copiedSecret = value;
        },
      },
    });
  });
  await page.getByRole("button", { name: "Create API key", exact: true }).click();
  await page.getByLabel("Key name").fill("  Website sync  ");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByLabel("Your new API key")).toHaveValue(state.keySecret);
  await page.screenshot({
    path: "test-results/api-key-secret-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Copy key", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Key copied to clipboard");
  expect(
    await page.evaluate(() => (window as Window & { copiedSecret?: string }).copiedSecret),
  ).toBe(state.keySecret);
  const creation = state.mutations.find((m) => m.path === "/api-keys" && m.method === "POST")!;
  expect(creation.body).toEqual({ name: "Website sync" });
  await page.getByRole("button", { name: "I’ve saved the key" }).click();
  await expect(page.getByLabel("Your new API key")).toHaveCount(0);
  await expect(page.getByText("Website sync", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revoke Website sync", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: "test-results/api-keys-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Revoke Website sync", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    state.mutations.filter((m) => m.path.startsWith("/api-keys/") && m.method === "DELETE"),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Revoke Website sync", exact: true }).click();
  await page.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Website sync", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create API key", exact: true }).click();
  await expect(page.getByLabel("Key name")).toHaveValue("");
  await expect(page.getByLabel("Your new API key")).toHaveCount(0);
});

test("key service and clipboard errors can be retried without losing the new secret", async ({
  page,
}) => {
  const state = await mockDashboard(page);
  state.failKeys("GET");
  await page.goto("/admin/api-keys");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("alert")).toContainText("Key service unavailable");
  state.failKeys(null);
  await page.getByRole("button", { name: "Refresh API keys" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Create API key", exact: true }).click();
  await page.getByLabel("Key name").fill("Sync");
  state.failKeys("POST");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Key service unavailable",
  );
  await expect(page.getByLabel("Key name")).toHaveValue("Sync");
  state.failKeys("GET");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByLabel("Your new API key")).toHaveValue(state.keySecret);
  await expect(page.getByRole("button", { name: "Create key", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard denied");
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy key", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("copy it manually");
  await expect(page.getByLabel("Your new API key")).toHaveValue(state.keySecret);
  await page.getByRole("button", { name: "I’ve saved the key" }).click();
  state.failKeys(null);
  await page.getByRole("button", { name: "Refresh API keys" }).click();
  await expect(page.getByRole("cell", { name: "Sync", exact: true })).toBeVisible();
  state.failKeys("DELETE");
  await page.getByRole("button", { name: "Revoke Sync", exact: true }).click();
  await page.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Key service unavailable",
  );
  state.failKeys(null);
  await page.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Sync", exact: true })).toHaveCount(0);
});

test("revoking the last key on a page returns to the previous page and expiry clears secrets", async ({
  page,
}) => {
  const state = await mockDashboard(page, "ADMIN", 0, 26);
  await page.goto("/admin/api-keys");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Integration 25", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revoke Integration 25", exact: true }).click();
  await page.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Integration 0", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await page.screenshot({
    path: "test-results/api-keys-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Create API key", exact: true }).click();
  await page.getByLabel("Key name").fill("Expiry check");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByLabel("Your new API key")).toHaveValue(state.keySecret);
  state.expire();
  await page.getByRole("button", { name: "I’ve saved the key" }).click();
  await page.getByRole("button", { name: "Refresh API keys" }).click();
  await expect(page.getByRole("heading", { name: "Admin workspace" })).toBeVisible();
  await expect(page.getByLabel("Your new API key")).toHaveCount(0);
});

test("static deep links preserve real Worker routing and authentication", async ({ request }) => {
  const deepLink = await request.get(`/admin/accounts/${id(2)}/collections/${id(3)}`);
  expect(deepLink.headers()["content-type"]).toContain("text/html");
  expect((await request.get("/admin/api-keys")).headers()["content-type"]).toContain("text/html");
  const health = await request.get("/health");
  expect(await health.json()).toEqual({ ok: true });
  const schema = await request.get("/openapi.json");
  expect((await schema.json()).openapi).toBe("3.0.3");
  const unauthorized = await request.get("/api/users");
  expect(unauthorized.status()).toBe(401);
  expect(await unauthorized.json()).toEqual({ error: "Google ID token required" });
});
