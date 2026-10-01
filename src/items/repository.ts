import type { Database, Statement } from "../utils/database";
import type { Field } from "../fields/schemas";
import { collectionLock } from "../collections/repository";
import type { Item, ItemFilter, ValueInput } from "./schemas";
import { compileFilters, valueColumns } from "./service";

const itemSelect = `SELECT i.id,i.collection_id,i.created_at,i.updated_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'field_id',v.field_id,'type',v.type,'value',
    CASE v.type WHEN 'TEXT' THEN to_jsonb(v.text_value) WHEN 'NUMBER' THEN to_jsonb(v.number_value)
      WHEN 'BOOL' THEN to_jsonb(v.bool_value) WHEN 'DATE' THEN to_jsonb(to_char(v.date_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      WHEN 'CATEGORY' THEN to_jsonb(v.category_option_id) WHEN 'USER' THEN to_jsonb(v.user_id)
      WHEN 'RELATION' THEN to_jsonb(v.related_item_id) END) ORDER BY v.field_id)
    FROM crm_field_values v WHERE v.item_id = i.id),'[]'::jsonb) AS values
  FROM crm_items i JOIN crm_collections c ON c.id = i.collection_id`;

function valueStatements(
  itemId: string,
  collectionId: string,
  owner: string,
  fields: Field[],
  values: ValueInput[],
): Statement[] {
  return values.map((input) => {
    if (input.value === null)
      return {
        text: `DELETE FROM crm_field_values v USING crm_items i,crm_collections c WHERE v.item_id = i.id AND i.collection_id = c.id AND i.id = $1 AND i.collection_id = $2 AND c.user_id = $3 AND v.field_id = $4`,
        params: [itemId, collectionId, owner, input.field_id],
      };
    const field = fields.find((f) => f.id === input.field_id)!;
    // These SQL identifiers come only from the fixed type map, never request text.
    const assignments = Object.values(valueColumns)
      .map((col) => `${col} = EXCLUDED.${col}`)
      .join(",");
    return {
      text: `INSERT INTO crm_field_values (id,item_id,collection_id,field_id,type,relation_collection_id,${valueColumns[field.type]})
      SELECT $1,i.id,i.collection_id,$4,$7,$8,$5 FROM crm_items i
      JOIN crm_collections c ON c.id = i.collection_id
      WHERE i.id = $2 AND c.user_id = $3 AND i.collection_id = $6
      ON CONFLICT (item_id,field_id) DO UPDATE SET ${assignments},relation_collection_id = EXCLUDED.relation_collection_id`,
      params: [
        crypto.randomUUID(),
        itemId,
        owner,
        input.field_id,
        field.type === "DATE" ? new Date(input.value as string).toISOString() : input.value,
        collectionId,
        field.type,
        field.relation_collection_id,
      ],
    };
  });
}

export function itemsRepository(db: Database) {
  const get = async (id: string, collection: string, owner: string) =>
    (
      await db.query<Item>(
        `${itemSelect} WHERE i.id = $1 AND i.collection_id = $2 AND c.user_id = $3`,
        [id, collection, owner],
      )
    )[0] ?? null;

  return {
    get,
    async list(
      collection: string,
      owner: string,
      fields: Field[],
      filters: ItemFilter[],
      limit: number,
      offset: number,
    ) {
      const params: unknown[] = [collection, owner];
      const clauses = compileFilters(fields, filters, params);
      params.push(limit, offset);
      return db.query<Item>(
        `${itemSelect} WHERE i.collection_id = $1 AND c.user_id = $2${clauses} ORDER BY i.created_at DESC,i.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
    },
    async create(collection: string, owner: string, fields: Field[], values: ValueInput[]) {
      const id = crypto.randomUUID();
      await db.transaction([
        collectionLock(collection, owner),
        {
          text: "INSERT INTO crm_items (id,collection_id) SELECT $1,id FROM crm_collections WHERE id = $2 AND user_id = $3",
          params: [id, collection, owner],
        },
        {
          text: `INSERT INTO crm_field_values (id,item_id,collection_id,field_id,type,category_option_id)
          SELECT gen_random_uuid(),i.id,i.collection_id,f.id,'CATEGORY',o.id FROM crm_items i JOIN crm_fields f ON f.collection_id = i.collection_id
          JOIN crm_category_options o ON o.field_id = f.id AND o.is_default WHERE i.id = $1`,
          params: [id],
        },
        ...valueStatements(id, collection, owner, fields, values),
      ]);
      return get(id, collection, owner);
    },
    async update(
      id: string,
      collection: string,
      owner: string,
      fields: Field[],
      values: ValueInput[],
    ) {
      await db.transaction([
        collectionLock(collection, owner),
        {
          text: "UPDATE crm_items i SET updated_at = now() FROM crm_collections c WHERE i.id = $1 AND i.collection_id = $2 AND c.id = i.collection_id AND c.user_id = $3",
          params: [id, collection, owner],
        },
        ...valueStatements(id, collection, owner, fields, values),
      ]);
      return get(id, collection, owner);
    },
    async delete(id: string, collection: string, owner: string) {
      return (
        (
          await db.query(
            "DELETE FROM crm_items i USING crm_collections c WHERE i.id = $1 AND i.collection_id = $2 AND c.id = i.collection_id AND c.user_id = $3 RETURNING i.id",
            [id, collection, owner],
          )
        ).length > 0
      );
    },
  };
}
