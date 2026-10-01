import { createRoute, z } from "@hono/zod-openapi";
import {
  body,
  content,
  errors,
  requireJson,
  router,
  scopeQuery,
  security,
  uuid,
  ApiError,
} from "../utils/http";
import { accountScope } from "../auth/service";
import { collectionParams } from "../collections/schemas";
import { requireCollection, updateCollection } from "../collections/service";
import { createFieldSchema, fieldSchema, renameFieldSchema } from "./schemas";

export function fieldsRoutes() {
  const app = router();
  const path = "/collections/{collectionId}/fields";
  const params = collectionParams.extend({ fieldId: uuid });
  const response = {
    description: "Field definition",
    content: content(z.object({ field: fieldSchema })),
  };
  app.openapi(
    createRoute({
      method: "get",
      path,
      tags: ["Fields"],
      summary: "List collection fields",
      security,
      request: { params: collectionParams, query: scopeQuery },
      responses: {
        200: {
          description: "Field definitions",
          content: content(z.object({ fields: z.array(fieldSchema) })),
        },
        ...errors,
      },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const collection = await requireCollection(
        c.get("db"),
        c.req.valid("param").collectionId,
        owner,
      );
      return c.json({ fields: collection.fields }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path,
      tags: ["Fields"],
      summary: "Add a field to a collection",
      description:
        "CATEGORY requires unique options and at most one default; RELATION requires a target collection in the same account. Type, options and relation target are immutable. New fields do not backfill existing items.",
      security,
      middleware: [requireJson],
      request: { params: collectionParams, query: scopeQuery, body: body(createFieldSchema) },
      responses: { 201: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const collectionId = c.req.valid("param").collectionId;
      const input = c.req.valid("json");
      const collection = await updateCollection(c.get("db"), collectionId, owner, {
        fields: { add: [input], rename: [], delete: [] },
      });
      const field = collection.fields.find((f) => f.name === input.name)!;
      c.header("Location", `/api/collections/${collectionId}/fields/${field.id}`);
      return c.json({ field }, 201);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: `${path}/{fieldId}`,
      tags: ["Fields"],
      summary: "Read a field",
      security,
      request: { params, query: scopeQuery },
      responses: { 200: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const { collectionId, fieldId } = c.req.valid("param");
      const field = (await requireCollection(c.get("db"), collectionId, owner)).fields.find(
        (f) => f.id === fieldId,
      );
      if (!field) throw new ApiError(404, "Field not found");
      return c.json({ field }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: `${path}/{fieldId}`,
      tags: ["Fields"],
      summary: "Rename a field",
      security,
      middleware: [requireJson],
      request: { params, query: scopeQuery, body: body(renameFieldSchema) },
      responses: { 200: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const { collectionId, fieldId } = c.req.valid("param");
      const collection = await updateCollection(c.get("db"), collectionId, owner, {
        fields: { add: [], rename: [{ id: fieldId, ...c.req.valid("json") }], delete: [] },
      });
      return c.json({ field: collection.fields.find((f) => f.id === fieldId)! }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: `${path}/{fieldId}`,
      tags: ["Fields"],
      summary: "Delete a field and its values",
      security,
      request: { params, query: scopeQuery },
      responses: { 204: { description: "Field deleted" }, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const { collectionId, fieldId } = c.req.valid("param");
      await updateCollection(c.get("db"), collectionId, owner, {
        fields: { add: [], rename: [], delete: [fieldId] },
      });
      return c.body(null, 204);
    },
  );
  return app;
}
