import { neon } from "@neondatabase/serverless";

export type ItemInput = { title: string; description: string };
export type Item = ItemInput & {
  id: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export interface ItemsRepository {
  list(): Promise<Item[]>;
  create(id: string, input: ItemInput): Promise<Item>;
  get(id: string): Promise<Item | null>;
  replace(id: string, input: ItemInput): Promise<Item | null>;
  delete(id: string): Promise<boolean>;
}

export function createNeonItemsRepository(databaseUrl: string): ItemsRepository {
  const sql = neon(databaseUrl);
  return {
    async list() {
      const rows =
        await sql`SELECT id, title, description, created_at, updated_at FROM api_items ORDER BY created_at DESC LIMIT 100`;
      return rows as Item[];
    },
    async create(id, input) {
      const [item] =
        await sql`INSERT INTO api_items (id, title, description) VALUES (${id}, ${input.title}, ${input.description}) RETURNING id, title, description, created_at, updated_at`;
      return item as Item;
    },
    async get(id) {
      const [item] =
        await sql`SELECT id, title, description, created_at, updated_at FROM api_items WHERE id = ${id}`;
      return (item as Item | undefined) ?? null;
    },
    async replace(id, input) {
      const [item] =
        await sql`UPDATE api_items SET title = ${input.title}, description = ${input.description}, updated_at = now() WHERE id = ${id} RETURNING id, title, description, created_at, updated_at`;
      return (item as Item | undefined) ?? null;
    },
    async delete(id) {
      const [item] = await sql`DELETE FROM api_items WHERE id = ${id} RETURNING id`;
      return Boolean(item);
    },
  };
}
