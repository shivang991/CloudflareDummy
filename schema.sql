CREATE TABLE IF NOT EXISTS api_items (
  id uuid PRIMARY KEY,
  title varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
