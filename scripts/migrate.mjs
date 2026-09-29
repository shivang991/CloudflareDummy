import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const schema = await readFile(new URL("../schema.sql", import.meta.url), "utf8");
await neon(process.env.DATABASE_URL).query(schema);
console.log("Database schema is ready.");
