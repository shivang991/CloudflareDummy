import { createRoute, z } from "@hono/zod-openapi";
import {
  body,
  content,
  errors,
  pageQuery,
  pageSchema,
  requireJson,
  router,
  scopeQuery,
  security,
  ApiError,
} from "../utils/http";
import { accountScope } from "../auth/service";
import {
  collectionParams as params,
  collectionSchema,
  createCollectionSchema,
  updateCollectionSchema,
} from "./schemas";
import { collectionsRepository } from "./repository";
import { requireCollection, updateCollection } from "./service";

export function collectionsRoutes() {
  const app = router();
  const response = {
    description: "Collection with field definitions",
    content: content(z.object({ collection: collectionSchema })),
  };
  app.openapi(
    createRoute({
      method: "get",
      path: "/collections",
      tags: ["Collections"],
      summary: "List account collections",
      security,
      request: { query: pageQuery },
      responses: {
        200: {
          description: "Paginated collections",
          content: content(z.object({ collections: z.array(collectionSchema), page: pageSchema })),
        },
        ...errors,
      },
    }),
    async (c) => {
      const { actAs, limit, offset } = c.req.valid("query");
      const owner = await accountScope(c, actAs);
      const rows = await collectionsRepository(c.get("db")).list(owner, limit + 1, offset);
      return c.json(
        {
          collections: rows.slice(0, limit),
          page: { limit, offset, has_more: rows.length > limit },
        },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/collections",
      tags: ["Collections"],
      summary: "Create a collection and its fields",
      security,
      middleware: [requireJson],
      request: { query: scopeQuery, body: body(createCollectionSchema) },
      responses: { 201: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      const collection = await collectionsRepository(c.get("db")).create(
        owner,
        c.req.valid("json"),
      );
      c.header("Location", `/api/collections/${collection.id}`);
      return c.json({ collection }, 201);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/collections/{collectionId}",
      tags: ["Collections"],
      summary: "Read a collection",
      security,
      request: { params, query: scopeQuery },
      responses: { 200: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      return c.json(
        {
          collection: await requireCollection(
            c.get("db"),
            c.req.valid("param").collectionId,
            owner,
          ),
        },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: "/collections/{collectionId}",
      tags: ["Collections"],
      summary: "Update collection name and fields",
      description:
        "Atomic change set. fields.add creates definitions, fields.rename changes names, fields.delete removes definitions and their values. Ownership and field metadata cannot be changed.",
      security,
      middleware: [requireJson],
      request: { params, query: scopeQuery, body: body(updateCollectionSchema) },
      responses: { 200: response, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      return c.json(
        {
          collection: await updateCollection(
            c.get("db"),
            c.req.valid("param").collectionId,
            owner,
            c.req.valid("json"),
          ),
        },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: "/collections/{collectionId}",
      tags: ["Collections"],
      summary: "Delete a collection",
      description:
        "Cascades fields and items. Conflicts if a remaining relation field targets this collection.",
      security,
      request: { params, query: scopeQuery },
      responses: { 204: { description: "Collection deleted" }, ...errors },
    }),
    async (c) => {
      const owner = await accountScope(c, c.req.valid("query").actAs);
      if (
        !(await collectionsRepository(c.get("db")).delete(c.req.valid("param").collectionId, owner))
      )
        throw new ApiError(404, "Collection not found");
      return c.body(null, 204);
    },
  );
  return app;
}
