import { createRoute, z } from "@hono/zod-openapi";
import {
  body,
  content,
  errors,
  pageSchema,
  requireJson,
  router,
  scopeQuery,
  apiKeySecurity as security,
  uuid,
  ApiError,
} from "../utils/http";
import { accountScope } from "../auth/service";
import { collectionParams } from "../collections/schemas";
import { requireCollection } from "../collections/service";
import { createItemSchema, itemListQuery, itemSchema, updateItemSchema } from "./schemas";
import { parseFilters, validateValues } from "./service";
import { itemsRepository } from "./repository";

export function itemsRoutes() {
  const app = router();
  const path = "/collections/{collectionId}/items";
  const params = collectionParams.extend({ itemId: uuid });
  const response = {
    description: "Item and typed values",
    content: content(z.object({ item: itemSchema })),
  };
  app.openapi(
    createRoute({
      method: "get",
      path,
      tags: ["Items"],
      summary: "List and filter collection items",
      description:
        "Filters use AND. Missing values match is_empty only; ne requires a stored unequal value. TEXT contains is case-sensitive and treats SQL wildcards as literal characters. DATE accepts ISO 8601 timestamps with timezone. ID types filter by ID equality.",
      security,
      request: { params: collectionParams, query: itemListQuery },
      responses: {
        200: {
          description: "Paginated matching items",
          content: content(z.object({ items: z.array(itemSchema), page: pageSchema })),
        },
        ...errors,
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const owner = await accountScope(c, query.actAs);
      const collectionId = c.req.valid("param").collectionId;
      const collection = await requireCollection(c.get("db"), collectionId, owner);
      const rows = await itemsRepository(c.get("db")).list(
        collectionId,
        owner,
        collection.fields,
        parseFilters(query.filters),
        query.limit + 1,
        query.offset,
      );
      return c.json(
        {
          items: rows.slice(0, query.limit),
          page: { limit: query.limit, offset: query.offset, has_more: rows.length > query.limit },
        },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path,
      tags: ["Items"],
      summary: "Create an item with field values",
      description:
        "Missing CATEGORY fields receive their default option, if configured. Explicit null clears a default. Values must match the collection's fields. USER references an existing account; RELATION references an item in the configured target collection of this account.",
      security,
      middleware: [requireJson],
      request: { params: collectionParams, query: scopeQuery, body: body(createItemSchema) },
      responses: { 201: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const collectionId = c.req.valid("param").collectionId;
      const collection = await requireCollection(c.get("db"), collectionId, owner);
      const { values } = c.req.valid("json");
      validateValues(collection.fields, values);
      const item = await itemsRepository(c.get("db")).create(
        collectionId,
        owner,
        collection.fields,
        values,
      );
      if (!item) throw new ApiError(404, "Collection not found");
      c.header("Location", `/api/collections/${collectionId}/items/${item.id}`);
      return c.json({ item }, 201);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: `${path}/{itemId}`,
      tags: ["Items"],
      summary: "Read an item",
      security,
      request: { params, query: scopeQuery },
      responses: { 200: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const { collectionId, itemId } = c.req.valid("param");
      const item = await itemsRepository(c.get("db")).get(itemId, collectionId, owner);
      if (!item) throw new ApiError(404, "Item not found");
      return c.json({ item }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: `${path}/{itemId}`,
      tags: ["Items"],
      summary: "Add, update or clear item field values",
      description:
        "Atomic partial update. Supplied field values are upserted; null removes the stored value. Omitted fields are unchanged; item ownership and collection cannot be changed.",
      security,
      middleware: [requireJson],
      request: { params, query: scopeQuery, body: body(updateItemSchema) },
      responses: { 200: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const { collectionId, itemId } = c.req.valid("param");
      const collection = await requireCollection(c.get("db"), collectionId, owner);
      const { values } = c.req.valid("json");
      validateValues(collection.fields, values);
      const item = await itemsRepository(c.get("db")).update(
        itemId,
        collectionId,
        owner,
        collection.fields,
        values,
      );
      if (!item) throw new ApiError(404, "Item not found");
      return c.json({ item }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: `${path}/{itemId}`,
      tags: ["Items"],
      summary: "Delete an item",
      description:
        "Cascades values. Conflicts if a remaining item has a relation value referencing this item.",
      security,
      request: { params, query: scopeQuery },
      responses: { 204: { description: "Item deleted" }, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const { collectionId, itemId } = c.req.valid("param");
      if (!(await itemsRepository(c.get("db")).delete(itemId, collectionId, owner)))
        throw new ApiError(404, "Item not found");
      return c.body(null, 204);
    },
  );
  return app;
}
