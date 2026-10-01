import { z } from "@hono/zod-openapi";
import { uuid } from "../utils/http";

export type Identity = { sub: string; email: string };

export const profileSchema = z
  .strictObject({
    name: z.string().trim().max(200).optional(),
    avatar_url: z.url().max(2000).optional(),
  })
  .openapi("Profile");

export const roleSchema = z.enum(["ADMIN", "USER"]);

export const emailSchema = z
  .email()
  .max(320)
  .transform((v) => v.toLowerCase());

export const userSchema = z
  .object({
    id: uuid,
    email: z.string(),
    profile: profileSchema,
    role: roleSchema,
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("User");

export type User = z.infer<typeof userSchema>;

export const createUserSchema = z.strictObject({
  email: emailSchema.optional(),
  profile: profileSchema.default({}),
  role: roleSchema.optional(),
});

export const updateUserSchema = z
  .strictObject({
    email: emailSchema.optional(),
    profile: profileSchema.optional(),
    role: roleSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one property");
