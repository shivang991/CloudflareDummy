import type { Database, Statement } from "../utils/database";
import type { CreateField, Field } from "./schemas";

export const fieldsSelect = `SELECT f.id, f.collection_id, f.name, f.type, f.relation_collection_id,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'field_id',o.field_id,'name',o.name,'default',o.is_default) ORDER BY o.position,o.id)
    FROM crm_category_options o WHERE o.field_id = f.id),'[]'::jsonb) AS options
  FROM crm_fields f WHERE f.collection_id = $1 AND f.user_id = $2 ORDER BY f.created_at,f.id`;

export function addFieldStatements(
  collectionId: string,
  owner: string,
  input: CreateField,
  id = crypto.randomUUID(),
): Statement[] {
  const statements: Statement[] = [
    {
      text: `INSERT INTO crm_fields (id,collection_id,user_id,name,type,relation_collection_id)
    SELECT $1,c.id,c.user_id,$4,$5,$6 FROM crm_collections c WHERE c.id = $2 AND c.user_id = $3`,
      params: [
        id,
        collectionId,
        owner,
        input.name,
        input.type,
        input.relation_collection_id ?? null,
      ],
    },
  ];
  input.options?.forEach((o, position) =>
    statements.push({
      text: `INSERT INTO crm_category_options (id,field_id,name,is_default,position)
    SELECT $1,f.id,$3,$4,$5 FROM crm_fields f WHERE f.id = $2 AND f.user_id = $6`,
      params: [crypto.randomUUID(), id, o.name, o.default, position, owner],
    }),
  );
  return statements;
}

export function fieldsRepository(db: Database) {
  return {
    list: (collection: string, owner: string) => db.query<Field>(fieldsSelect, [collection, owner]),
    listMany: (collections: string[], owner: string) =>
      db.query<Field>(
        fieldsSelect.replace("f.collection_id = $1", "f.collection_id = ANY($1::uuid[])"),
        [collections, owner],
      ),
  };
}
