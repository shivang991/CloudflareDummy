import { neon } from "@neondatabase/serverless";

export type Statement = { text: string; params?: unknown[] };

export interface Database {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction(statements: Statement[]): Promise<unknown[][]>;
}

export function createDatabase(url: string): Database {
  const sql = neon(url);
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await sql.query(text, params)) as T[],
    transaction: (statements) =>
      sql.transaction(statements.map((s) => sql.query(s.text, s.params))),
  };
}
