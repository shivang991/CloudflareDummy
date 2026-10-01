# Mini CRM Worker

A JSON-only CRM API on Cloudflare Workers, Hono, and Neon/Postgres. Google ID tokens authenticate requests. Collections belong to accounts and define typed fields; items store values for those fields.

- [API reference and examples](docs/api.md)
- [Database design](docs/database.md)
- Generated OpenAPI 3.0.3 document: `GET /openapi.json` (public)
- Health check: `GET /health` (public, does not query Postgres)

## Setup

Use Node.js 22 or later. Install dependencies and configure local environment variables:

```sh
npm ci
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your Neon `DATABASE_URL`, Google OAuth `GOOGLE_CLIENT_ID`, and the verified Google email that should administer the CRM in `ADMIN_EMAIL`. `SEED_USER_EMAIL` defaults to `demo@example.com`; set it to another real Google email if you want to sign in to the sample account.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Both database scripts target the database in `DATABASE_URL`. The migration runs atomically and can be reapplied. It creates CRM tables without deleting the old `api_items` table; the worker no longer reads or exposes dummy items.

The seed creates **one ADMIN** and one sample USER with Companies, Contacts, all seven field types, and sample items. It is repeatable, preserves existing sample data, and links provisioned accounts to their verified Google identity on first authenticated request. It refuses to proceed if an admin with a different email already exists, rather than changing existing users' rights. Newly registered users always receive USER. Admins may grant additional admin roles later through the API.

You can override seed-only settings without editing the environment file:

```sh
ADMIN_EMAIL="you@example.com" SEED_USER_EMAIL="colleague@example.com" npm run db:seed
```

For deployment, set `DATABASE_URL` and `GOOGLE_CLIENT_ID` as Wrangler secrets, then use `npm run deploy`. Seed variables are only needed when running the seed script. The existing Wrangler worker name is retained.

## Checks

```sh
npm test
npm run test:unit
npm run test:system
npm run typecheck
npm run lint
npm run format:check
```

System tests send requests through the complete app and run the production SQL against an isolated, in-memory Postgres instance using PGlite. They require neither external database credentials nor network access. Google verifier unit tests use locally signed RSA tokens and a mocked Google JWKS endpoint.

## Structure

```text
src/
  auth/          # Google authentication, user accounts, roles, account scope
  collections/   # Collection schemas, repository, service, routes
  fields/        # Field definitions and category metadata
  items/         # Typed values, filtering, repository, routes
  utils/         # Shared database adapter, HTTP helpers, app types
  index.ts       # Worker composition and errors
scripts/
  migrate.mjs
  seed.mjs
tests/
  auth/authUnit.test.ts, authSystem.test.ts
  collections/collectionsUnit.test.ts, collectionsSystem.test.ts
  fields/fieldsUnit.test.ts, fieldsSystem.test.ts
  items/itemsUnit.test.ts, itemsSystem.test.ts
  utils/harness.ts
```

Repositories own domain SQL; services own rules that need more than request-schema validation. Database and identity-verifier factories can be injected into `createApp` for testing. The frontend can use the OpenAPI document for client generation in the next step.
