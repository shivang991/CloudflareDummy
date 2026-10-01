import { neon } from "@neondatabase/serverless";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const seedIds = {
  admin: "00000000-0000-4000-8000-000000000001",
  demo: "00000000-0000-4000-8000-000000000002",
  companies: "00000000-0000-4000-8000-000000000010",
  contacts: "00000000-0000-4000-8000-000000000011",
  companyName: "00000000-0000-4000-8000-000000000020",
  name: "00000000-0000-4000-8000-000000000021",
  revenue: "00000000-0000-4000-8000-000000000022",
  active: "00000000-0000-4000-8000-000000000023",
  followup: "00000000-0000-4000-8000-000000000024",
  status: "00000000-0000-4000-8000-000000000025",
  assigned: "00000000-0000-4000-8000-000000000026",
  company: "00000000-0000-4000-8000-000000000027",
  lead: "00000000-0000-4000-8000-000000000030",
  customer: "00000000-0000-4000-8000-000000000031",
  companyItem: "00000000-0000-4000-8000-000000000040",
  contactItem: "00000000-0000-4000-8000-000000000041",
};

export function seedStatements(adminInput, demoInput = "demo@example.com") {
  const email = z
    .email()
    .max(320)
    .transform((v) => v.toLowerCase());
  const adminEmail = email.parse(adminInput);
  const demoEmail = email.parse(demoInput);
  if (adminEmail === demoEmail) throw new Error("ADMIN_EMAIL and SEED_USER_EMAIL must differ");
  const id = seedIds;
  const statements = [
    { text: "LOCK TABLE crm_users IN SHARE ROW EXCLUSIVE MODE" },
    { text: "CREATE TEMP TABLE crm_seed_config (admin_email text) ON COMMIT DROP" },
    { text: "INSERT INTO crm_seed_config VALUES ($1)", params: [adminEmail] },
    {
      text: `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM crm_users WHERE role = 'ADMIN' AND email <> (SELECT admin_email FROM crm_seed_config)) THEN
        RAISE EXCEPTION 'Seed refused: another admin already exists. Manage roles through the API before seeding.';
      END IF;
    END $$`,
    },
    {
      text: `INSERT INTO crm_users (id,email,profile,role) VALUES ($1,$2,'{"name":"Administrator"}','ADMIN')
      ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', updated_at = now()`,
      params: [id.admin, adminEmail],
    },
    {
      text: `INSERT INTO crm_users (id,email,profile,role) VALUES ($1,$2,'{"name":"Demo User"}','USER')
      ON CONFLICT (email) DO NOTHING`,
      params: [id.demo, demoEmail],
    },
  ];
  for (const [collectionId, name] of [
    [id.companies, "Companies"],
    [id.contacts, "Contacts"],
  ]) {
    statements.push({
      text: `INSERT INTO crm_collections (id,user_id,name) SELECT $1,id,$3 FROM crm_users WHERE email = $2 ON CONFLICT DO NOTHING`,
      params: [collectionId, demoEmail, name],
    });
  }
  for (const [fieldId, collection, name, type, target] of [
    [id.companyName, id.companies, "Name", "TEXT", null],
    [id.name, id.contacts, "Name", "TEXT", null],
    [id.revenue, id.contacts, "Revenue", "NUMBER", null],
    [id.active, id.contacts, "Active", "BOOL", null],
    [id.followup, id.contacts, "Follow up", "DATE", null],
    [id.status, id.contacts, "Status", "CATEGORY", null],
    [id.assigned, id.contacts, "Assigned to", "USER", null],
    [id.company, id.contacts, "Company", "RELATION", id.companies],
  ])
    statements.push({
      text: `INSERT INTO crm_fields (id,collection_id,user_id,name,type,relation_collection_id)
    SELECT $1,c.id,c.user_id,$3,$4,$5 FROM crm_collections c JOIN crm_users u ON u.id = c.user_id WHERE c.id = $2 AND u.email = $6 ON CONFLICT DO NOTHING`,
      params: [fieldId, collection, name, type, target, demoEmail],
    });
  statements.push(
    {
      text: "INSERT INTO crm_category_options (id,field_id,name,is_default,position) VALUES ($1,$3,'Lead',true,0),($2,$3,'Customer',false,1) ON CONFLICT DO NOTHING",
      params: [id.lead, id.customer, id.status],
    },
    {
      text: "INSERT INTO crm_items (id,collection_id) VALUES ($1,$2),($3,$4) ON CONFLICT DO NOTHING",
      params: [id.companyItem, id.companies, id.contactItem, id.contacts],
    },
  );
  for (const [item, collection, field, type, column, value, target] of [
    [id.companyItem, id.companies, id.companyName, "TEXT", "text_value", "Acme Inc.", null],
    [id.contactItem, id.contacts, id.name, "TEXT", "text_value", "Alex Morgan", null],
    [id.contactItem, id.contacts, id.revenue, "NUMBER", "number_value", 12500, null],
    [id.contactItem, id.contacts, id.active, "BOOL", "bool_value", true, null],
    [id.contactItem, id.contacts, id.followup, "DATE", "date_value", "2026-10-15T16:00:00Z", null],
    [id.contactItem, id.contacts, id.status, "CATEGORY", "category_option_id", id.lead, null],
    [
      id.contactItem,
      id.contacts,
      id.company,
      "RELATION",
      "related_item_id",
      id.companyItem,
      id.companies,
    ],
  ])
    statements.push({
      text: `INSERT INTO crm_field_values (id,item_id,collection_id,field_id,type,${column},relation_collection_id)
    VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6) ON CONFLICT (item_id,field_id) DO NOTHING`,
      params: [item, collection, field, type, value, target],
    });
  statements.push({
    text: `INSERT INTO crm_field_values (id,item_id,collection_id,field_id,type,user_id)
    SELECT gen_random_uuid(),$1,$2,$3,'USER',id FROM crm_users WHERE email = $4 ON CONFLICT (item_id,field_id) DO NOTHING`,
    params: [id.contactItem, id.contacts, id.assigned, demoEmail],
  });
  return statements;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!process.env.ADMIN_EMAIL)
    throw new Error(
      "ADMIN_EMAIL is required; choose the Google email that should administer the CRM",
    );
  const sql = neon(process.env.DATABASE_URL);
  const statements = seedStatements(process.env.ADMIN_EMAIL, process.env.SEED_USER_EMAIL);
  await sql.transaction(statements.map((s) => sql.query(s.text, s.params)));
  console.log(
    "CRM seed complete: one admin, one demo USER, Companies and Contacts with all seven field types.",
  );
}
