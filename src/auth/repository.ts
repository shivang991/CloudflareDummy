import type { Database } from "../utils/database";
import type { Identity, User } from "./schemas";

const columns = "id, email, profile, role, created_at, updated_at";

export function usersRepository(db: Database) {
  return {
    async resolve(identity: Identity): Promise<User | null> {
      // A verified Google email can claim a provisioned account exactly once.
      const rows = await db.query<User>(
        `WITH linked AS (
        UPDATE crm_users SET google_sub = $1, updated_at = now()
        WHERE google_sub IS NULL AND email = $2
          AND NOT EXISTS (SELECT 1 FROM crm_users WHERE google_sub = $1)
        RETURNING ${columns}
      ) SELECT ${columns} FROM linked UNION ALL
        SELECT ${columns} FROM crm_users WHERE google_sub = $1 LIMIT 1`,
        [identity.sub, identity.email],
      );
      return rows[0] ?? null;
    },
    async get(id: string) {
      return (
        (await db.query<User>(`SELECT ${columns} FROM crm_users WHERE id = $1`, [id]))[0] ?? null
      );
    },
    list: (limit: number, offset: number) =>
      db.query<User>(
        `SELECT ${columns} FROM crm_users ORDER BY created_at DESC, id LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
    async create(email: string, profile: User["profile"], role: User["role"], sub: string | null) {
      return (
        await db.query<User>(
          `INSERT INTO crm_users (id,email,profile,role,google_sub) VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING ${columns}`,
          [crypto.randomUUID(), email, JSON.stringify(profile), role, sub],
        )
      )[0];
    },
    async update(id: string, patch: Partial<Pick<User, "email" | "profile" | "role">>) {
      return (
        (
          await db.query<User>(
            `UPDATE crm_users SET email = COALESCE($2,email), profile = COALESCE($3::jsonb,profile), role = COALESCE($4,role), updated_at = now() WHERE id = $1 RETURNING ${columns}`,
            [
              id,
              patch.email ?? null,
              patch.profile ? JSON.stringify(patch.profile) : null,
              patch.role ?? null,
            ],
          )
        )[0] ?? null
      );
    },
    async delete(id: string) {
      return (await db.query(`DELETE FROM crm_users WHERE id = $1 RETURNING id`, [id])).length > 0;
    },
  };
}
