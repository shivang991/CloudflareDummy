-- The dummy api_items table is deliberately left intact for manual archival.
-- This schema is additive and safe to apply repeatedly.
CREATE TABLE IF NOT EXISTS crm_users (
  id uuid PRIMARY KEY,
  google_sub text UNIQUE,
  email varchar(320) NOT NULL UNIQUE CHECK (email = lower(email)),
  profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object'),
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN','USER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS crm_api_keys (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL CHECK (length(trim(name)) > 0),
  key_prefix varchar(16) NOT NULL,
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_api_keys_owner_idx ON crm_api_keys(user_id,created_at DESC,id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS crm_collections (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,user_id)
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_collections_owner_idx ON crm_collections(user_id,created_at DESC,id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS crm_fields (
  id uuid PRIMARY KEY,
  collection_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name varchar(200) NOT NULL CHECK (length(trim(name)) > 0),
  type text NOT NULL CHECK (type IN ('TEXT','NUMBER','BOOL','DATE','CATEGORY','USER','RELATION')),
  relation_collection_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (collection_id,user_id) REFERENCES crm_collections(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (relation_collection_id,user_id) REFERENCES crm_collections(id,user_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((type = 'RELATION') = (relation_collection_id IS NOT NULL)),
  UNIQUE (collection_id,name),
  UNIQUE (id,collection_id,type),
  UNIQUE (id,relation_collection_id)
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_fields_relation_idx ON crm_fields(relation_collection_id,user_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS crm_category_options (
  id uuid PRIMARY KEY,
  field_id uuid NOT NULL REFERENCES crm_fields(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL CHECK (length(trim(name)) > 0),
  is_default boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  UNIQUE (field_id,name),
  UNIQUE (id,field_id)
);
-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS crm_category_one_default ON crm_category_options(field_id) WHERE is_default;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS crm_items (
  id uuid PRIMARY KEY,
  collection_id uuid NOT NULL REFERENCES crm_collections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,collection_id)
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_items_collection_idx ON crm_items(collection_id,created_at DESC,id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS crm_field_values (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL,
  collection_id uuid NOT NULL,
  field_id uuid NOT NULL,
  type text NOT NULL,
  text_value text CHECK (length(text_value) <= 10000),
  number_value double precision CHECK (number_value NOT IN ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8)),
  bool_value boolean,
  date_value timestamptz,
  category_option_id uuid,
  user_id uuid REFERENCES crm_users(id) DEFERRABLE INITIALLY DEFERRED,
  relation_collection_id uuid,
  related_item_id uuid,
  UNIQUE (item_id,field_id),
  FOREIGN KEY (item_id,collection_id) REFERENCES crm_items(id,collection_id) ON DELETE CASCADE,
  FOREIGN KEY (field_id,collection_id,type) REFERENCES crm_fields(id,collection_id,type) ON DELETE CASCADE,
  FOREIGN KEY (category_option_id,field_id) REFERENCES crm_category_options(id,field_id),
  FOREIGN KEY (field_id,relation_collection_id) REFERENCES crm_fields(id,relation_collection_id) ON DELETE CASCADE,
  FOREIGN KEY (related_item_id,relation_collection_id) REFERENCES crm_items(id,collection_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (num_nonnulls(text_value,number_value,bool_value,date_value,category_option_id,user_id,related_item_id) = 1),
  CHECK (
    (type = 'TEXT' AND text_value IS NOT NULL) OR
    (type = 'NUMBER' AND number_value IS NOT NULL) OR
    (type = 'BOOL' AND bool_value IS NOT NULL) OR
    (type = 'DATE' AND date_value IS NOT NULL) OR
    (type = 'CATEGORY' AND category_option_id IS NOT NULL) OR
    (type = 'USER' AND user_id IS NOT NULL) OR
    (type = 'RELATION' AND related_item_id IS NOT NULL)
  ),
  CHECK ((type = 'RELATION') = (relation_collection_id IS NOT NULL))
);
-- statement-breakpoint
-- Index the field rather than full text: long TEXT values exceed B-tree key limits.
CREATE INDEX IF NOT EXISTS crm_values_field_idx ON crm_field_values(field_id);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_values_number_idx ON crm_field_values(field_id,number_value);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_values_bool_idx ON crm_field_values(field_id,bool_value);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_values_date_idx ON crm_field_values(field_id,date_value);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_values_category_idx ON crm_field_values(field_id,category_option_id);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_values_user_idx ON crm_field_values(field_id,user_id);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_values_relation_idx ON crm_field_values(field_id,related_item_id);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_values_related_item_idx ON crm_field_values(related_item_id,relation_collection_id);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS crm_values_referenced_user_idx ON crm_field_values(user_id);
-- statement-breakpoint

CREATE OR REPLACE FUNCTION crm_field_metadata_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.collection_id,NEW.user_id,NEW.type,NEW.relation_collection_id)
    IS DISTINCT FROM (OLD.id,OLD.collection_id,OLD.user_id,OLD.type,OLD.relation_collection_id) THEN
    RAISE EXCEPTION 'Only field name can be updated' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- statement-breakpoint
DROP TRIGGER IF EXISTS crm_field_metadata_immutable ON crm_fields;
-- statement-breakpoint
CREATE TRIGGER crm_field_metadata_immutable BEFORE UPDATE ON crm_fields FOR EACH ROW EXECUTE FUNCTION crm_field_metadata_immutable();
-- statement-breakpoint

CREATE OR REPLACE FUNCTION crm_category_field_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_fields WHERE id = NEW.field_id AND type = 'CATEGORY') THEN
    RAISE EXCEPTION 'Options require a CATEGORY field' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- statement-breakpoint
DROP TRIGGER IF EXISTS crm_category_field_type ON crm_category_options;
-- statement-breakpoint
CREATE TRIGGER crm_category_field_type BEFORE INSERT OR UPDATE ON crm_category_options FOR EACH ROW EXECUTE FUNCTION crm_category_field_type();
-- statement-breakpoint
