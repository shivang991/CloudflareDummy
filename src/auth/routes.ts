import { createRoute, z } from "@hono/zod-openapi";
import {
  body,
  content,
  errors,
  pagination,
  pageSchema,
  requireJson,
  router,
  security,
  uuid,
  ApiError,
} from "../utils/http";
import { createUserSchema, updateUserSchema, userSchema } from "./schemas";
import { usersRepository } from "./repository";
import { authorizeUser, requireAdmin, requireUser } from "./service";

export function authRoutes() {
  const app = router();
  const params = z.object({ userId: uuid });
  const response = {
    description: "User account",
    content: content(z.object({ user: userSchema })),
  };
  app.openapi(
    createRoute({
      method: "get",
      path: "/users/me",
      tags: ["Auth"],
      summary: "Read your account",
      security,
      responses: { 200: response, ...errors },
    }),
    async (c) => c.json({ user: requireUser(c) }, 200),
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/users",
      tags: ["Auth"],
      summary: "List accounts (ADMIN)",
      security,
      request: { query: z.strictObject(pagination) },
      responses: {
        200: {
          description: "Paginated accounts",
          content: content(z.object({ users: z.array(userSchema), page: pageSchema })),
        },
        ...errors,
      },
    }),
    async (c) => {
      requireAdmin(c);
      const { limit, offset } = c.req.valid("query");
      const rows = await usersRepository(c.get("db")).list(limit + 1, offset);
      return c.json(
        { users: rows.slice(0, limit), page: { limit, offset, has_more: rows.length > limit } },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/users",
      tags: ["Auth"],
      summary: "Register yourself or provision an account (ADMIN)",
      description:
        "Self registration uses the verified token email and always creates USER. ADMIN may supply another email and a role. Provisioned users link to Google on first authenticated request.",
      security,
      middleware: [requireJson],
      request: { body: body(createUserSchema) },
      responses: { 201: response, ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const identity = c.get("identity");
      const admin = c.get("user")?.role === "ADMIN";
      if (!admin && input.role !== undefined)
        throw new ApiError(403, "Only admins may assign roles");
      if (!admin && input.email && input.email !== identity.email)
        throw new ApiError(403, "Use your verified Google email");
      if (!admin && c.get("user")) throw new ApiError(409, "Account already exists");
      const email = input.email ?? identity.email;
      const user = await usersRepository(c.get("db")).create(
        email,
        input.profile,
        admin ? (input.role ?? "USER") : "USER",
        email === identity.email ? identity.sub : null,
      );
      c.header("Location", `/api/users/${user.id}`);
      return c.json({ user }, 201);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/users/{userId}",
      tags: ["Auth"],
      summary: "Read an account",
      security,
      request: { params },
      responses: { 200: response, ...errors },
    }),
    async (c) => {
      const { userId } = c.req.valid("param");
      authorizeUser(c, userId);
      const user = await usersRepository(c.get("db")).get(userId);
      if (!user) throw new ApiError(404, "User not found");
      return c.json({ user }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: "/users/{userId}",
      tags: ["Auth"],
      summary: "Update an account",
      description:
        "Profile is replaced when supplied. USER may update only their own profile and email; email must match the token's verified email. ADMIN may also change role.",
      security,
      middleware: [requireJson],
      request: { params, body: body(updateUserSchema) },
      responses: { 200: response, ...errors },
    }),
    async (c) => {
      const { userId } = c.req.valid("param");
      authorizeUser(c, userId);
      const input = c.req.valid("json");
      if (requireUser(c).role !== "ADMIN") {
        if (input.role !== undefined) throw new ApiError(403, "Only admins may assign roles");
        if (input.email && input.email !== c.get("identity").email)
          throw new ApiError(403, "Use your verified Google email");
      }
      const user = await usersRepository(c.get("db")).update(userId, input);
      if (!user) throw new ApiError(404, "User not found");
      return c.json({ user }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: "/users/{userId}",
      tags: ["Auth"],
      summary: "Delete an account (ADMIN)",
      description:
        "Cascades owned collections, fields and items. Deletion conflicts if a remaining item references this user.",
      security,
      request: { params },
      responses: { 204: { description: "Account deleted" }, ...errors },
    }),
    async (c) => {
      requireAdmin(c);
      if (!(await usersRepository(c.get("db")).delete(c.req.valid("param").userId)))
        throw new ApiError(404, "User not found");
      return c.body(null, 204);
    },
  );
  return app;
}
