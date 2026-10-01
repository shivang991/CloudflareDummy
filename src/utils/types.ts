import type { Database } from "./database";
import type { Identity, User } from "../auth/schemas";

export type AppEnv = {
  Bindings: { DATABASE_URL: string; GOOGLE_CLIENT_ID: string };
  Variables: { db: Database; identity: Identity; user: User | null };
};
