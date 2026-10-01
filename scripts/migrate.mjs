import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

// Explicit separators preserve semicolons inside PL/pgSQL function bodies.
export function migrationStatements(schema) {
  return schema
    .split("-- statement-breakpoint")
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const schema = await readFile(new URL("../schema.sql", import.meta.url), "utf8");
  const sql = neon(process.env.DATABASE_URL);
  await sql.transaction(migrationStatements(schema).map((s) => sql.query(s.text)));
  console.log("CRM database schema is ready.");
}
