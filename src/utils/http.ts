import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./types";

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export const uuid = z.uuid().transform((v) => v.toLowerCase());

export const name = z.string().trim().min(1).max(200);

export const errorSchema = z
  .object({
    error: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .openapi("Error");

export const content = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

export const errors = {
  400: { description: "Invalid JSON, parameters, or field value", content: content(errorSchema) },
  401: { description: "Missing or invalid Google ID token", content: content(errorSchema) },
  403: {
    description: "Account registration or admin role required",
    content: content(errorSchema),
  },
  404: {
    description: "Resource missing or outside the selected account",
    content: content(errorSchema),
  },
  409: {
    description: "Unique constraint or referenced resource conflict",
    content: content(errorSchema),
  },
  413: { description: "Request body exceeds 256 KiB", content: content(errorSchema) },
  500: { description: "Internal server error", content: content(errorSchema) },
};

export const security = [{ GoogleIdToken: [] }];

export const body = <T extends z.ZodType>(schema: T) => ({
  required: true as const,
  content: content(schema),
});

export const requireJson: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new ApiError(400, "Content-Type must be application/json");
  await next();
};

export function router() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json(
          {
            error: "Validation failed",
            details: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          400,
        );
    },
  });
}

export const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
};

export const scopeQuery = z.strictObject({ actAs: uuid.optional() });

export const pageQuery = z.strictObject({ ...pagination, actAs: uuid.optional() });

export const pageSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
});
