import { createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { authenticate, verifyGoogleIdentity, type VerifyIdentity } from "./auth/middleware";
import { authRoutes } from "./auth/routes";
import { apiKeyRoutes } from "./auth/apiKeys";
import { collectionsRoutes } from "./collections/routes";
import { fieldsRoutes } from "./fields/routes";
import { itemsRoutes } from "./items/routes";
import { createDatabase, type Database } from "./utils/database";
import { ApiError, content, router } from "./utils/http";
import { filterSchema } from "./items/schemas";

export function createApp(
  options: { database?: (url: string) => Database; verifyIdentity?: VerifyIdentity } = {},
) {
  const app = router();
  app.openAPIRegistry.registerComponent("securitySchemes", "GoogleIdToken", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Google ID token for the configured OAuth client. Requires a verified email.",
  });
  app.openAPIRegistry.register("ItemFilter", filterSchema);
  app.openAPIRegistry.registerComponent("securitySchemes", "ApiKey", {
    type: "apiKey",
    in: "header",
    name: "X-API-Key",
    description:
      "Account-owned API key created with POST /api/api-keys. Allows item CRUD and collection reads within the owner's account. Cannot use actAs. Send only one authentication header.",
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/health",
      summary: "Worker health",
      description: "Does not query the database.",
      responses: {
        200: {
          description: "Worker is running",
          content: content(z.object({ ok: z.literal(true) })),
        },
      },
    }),
    (c) => c.json({ ok: true as const }, 200),
  );
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => c.json({ error: "Request body exceeds 256 KiB" }, 413),
    }),
  );
  app.use(
    "/api/*",
    authenticate(
      options.database ?? createDatabase,
      options.verifyIdentity ?? verifyGoogleIdentity,
    ),
  );
  app.route("/api", authRoutes());
  app.route("/api", apiKeyRoutes());
  app.route("/api", collectionsRoutes());
  app.route("/api", fieldsRoutes());
  app.route("/api", itemsRoutes());
  app.doc("/openapi.json", {
    openapi: "3.0.3",
    info: {
      title: "Mini CRM API",
      version: "2.0.0",
      description:
        "CRM authenticated with Google ID tokens, or account-owned API keys for item CRUD and collection reads. Register with POST /api/users and create keys with POST /api/api-keys using Google authentication. Resources default to your account; Google-authenticated ADMIN may select another account using actAs=<user UUID> on collection, field and item endpoints. Updates use PATCH; unknown input properties are rejected. See docs/api.md for examples and filter semantics.",
    },
    tags: [
      { name: "Auth", description: "Account registration and administration" },
      { name: "Collections", description: "Account-owned collections" },
      { name: "Fields", description: "Field definitions managed through collection APIs" },
      { name: "Items", description: "Items and typed field values" },
    ],
  });
  app.get(
    "/docs",
    swaggerUI({
      url: "/openapi.json",
      title: "Mini CRM API documentation",
      persistAuthorization: false,
    }),
  );
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.message }, error.status);
    if (error instanceof HTTPException) {
      if (error.status === 400) return c.json({ error: "Invalid JSON request" }, 400);
      return error.getResponse();
    }
    const code = (error as Error & { code?: string }).code;
    if (code === "23505")
      return c.json({ error: "Resource already exists or name is already in use" }, 409);
    if (code === "23503")
      return c.json(
        { error: "Referenced resource is missing, outside this account, or still in use" },
        409,
      );
    if (["23514", "22P02", "22007", "22008", "22003"].includes(code ?? ""))
      return c.json({ error: "Invalid field configuration or value" }, 400);
    console.error("Request failed", error);
    return c.json({ error: "Internal server error" }, 500);
  });
  return app;
}

export default createApp();
