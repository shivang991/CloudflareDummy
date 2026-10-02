# Mini CRM Worker

A CRM API and Vue admin dashboard on Cloudflare Workers, Hono, and Neon/Postgres. Google ID tokens authenticate API requests; account-owned API keys also support item CRUD and collection reads. Collections belong to accounts and define typed fields; items store values for those fields. The Vue dashboard uses TypeScript, shadcn-vue, and Tailwind CSS, and ships as Worker Static Assets with the existing API.

- [API reference and examples](docs/api.md)
- [Database design](docs/database.md)
- Generated OpenAPI 3.0.3 document: `GET /openapi.json` (public)
- Swagger UI: `/docs` (public). Use **Authorize** with your Google ID token or API key to try protected endpoints; send only one authentication method. Credentials are not persisted across reloads. Swagger UI assets load from jsDelivr.
- Health check: `GET /health` (public, does not query Postgres)

## Setup

Use Node.js 22 or later. Install dependencies and configure local environment variables:

```sh
npm ci
cp .dev.vars.example .dev.vars
cp .env.example .env.local
```

Edit `.dev.vars` with your Neon `DATABASE_URL`, Google OAuth `GOOGLE_CLIENT_ID`, and the verified Google email that should administer the CRM in `ADMIN_EMAIL`. `SEED_USER_EMAIL` defaults to `demo@example.com`; set it to another real Google email if you want to sign in to the sample account.

Set `VITE_GOOGLE_CLIENT_ID` in `.env.local` to the same Google client ID. This is a public identifier, not a secret; never put database credentials in a `VITE_` variable. Add `http://localhost:5173` (or your chosen development origin) and your production HTTPS origin to the Google OAuth client's **Authorized JavaScript origins**.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Both database scripts target the database in `DATABASE_URL`. The migration runs atomically and can be reapplied. It creates CRM tables without deleting the old `api_items` table; the worker no longer reads or exposes dummy items.

For integrations, create a key using Google authentication with `POST /api/api-keys` and `{"name":"Integration"}`, then send `X-API-Key: <key>` on item endpoints or collection reads. The secret is returned once and stored only as a hash. List and revoke your keys through `GET /api/api-keys` and `DELETE /api/api-keys/{keyId}`. Keys stay within the owner's account and cannot use `actAs`. Existing installations must rerun `npm run db:migrate` to add the key table. See the [API key examples](docs/api.md#api-keys).

The seed creates **one ADMIN** and one sample USER with Companies, Contacts, all seven field types, and sample items. It is repeatable, preserves existing sample data, and links provisioned accounts to their verified Google identity on first authenticated request. It refuses to proceed if an admin with a different email already exists, rather than changing existing users' rights. Newly registered users always receive USER. Admins may grant additional admin roles later through the API.

You can override seed-only settings without editing the environment file:

```sh
ADMIN_EMAIL="you@example.com" SEED_USER_EMAIL="colleague@example.com" npm run db:seed
```

Open `http://localhost:5173/admin/accounts` and sign in with the seeded admin Google account. Non-admin accounts cannot enter the dashboard. Google ID tokens remain in browser memory and are attached as bearer headers; there are no new login/session APIs or application auth cookies. Reloading or token expiry requires signing in again. Google manages its own sign-in state.

The dashboard supports account provisioning/profile/role changes/deletion; account-scoped collection creation/renaming/deletion; all seven field types and category defaults; record creation/editing/deletion with typed values; a field filter; and pagination. The **API keys** sidebar page at `/admin/api-keys` lists, creates, and revokes keys for the signed-in admin's own account. Newly created secrets appear once with a copy button and are cleared when dismissed; the list shows only key prefixes. Revocation requires confirmation. USER and RELATION inputs offer UUID suggestions and accept a UUID directly. Relation suggestions are paginated. Field types/options/targets remain immutable under the existing API contract. Destructive changes require confirmation, and API validation and reference conflicts appear in the relevant dialog.

`npm run dev` uses Vite with the Cloudflare plugin to serve the frontend and Worker on one origin. `npm run build` checks both TypeScript projects and builds the browser assets and Worker; `npm run preview` serves a production build locally.

For deployment, set `DATABASE_URL` and `GOOGLE_CLIENT_ID` as Wrangler secrets, ensure the public `VITE_GOOGLE_CLIENT_ID` is available at build time, then use `npm run deploy`. This builds and deploys both the dashboard and API together. Seed variables are only needed when running the seed script. The existing Wrangler worker name is retained. Static assets serve the SPA, including deep links; `/api/*`, `/health`, `/openapi.json`, and `/docs` always reach Hono. The static shell and API documentation are public; all CRM data remains protected by the API's authentication and role checks.

## Checks

```sh
npm test
npm run test:unit
npm run test:system
npm run typecheck
npm run lint
npm run format:check
npx playwright install chromium
npm run test:browser
```

System tests send requests through the complete app and run the production SQL against an isolated, in-memory Postgres instance using PGlite. They require neither external database credentials nor network access. Google verifier unit tests use locally signed RSA tokens and a mocked Google JWKS endpoint.

Frontend unit tests cover typed values, partial updates, token handling, API errors, and paginated suggestions. Browser tests exercise admin CRUD, API key creation/copying/revocation, error recovery, filtering, mobile navigation, and authorization using intercepted Google/API responses; a routing test hits the real local Worker without database credentials. They do not modify a real database.

## Structure

```text
src/
  auth/          # Google/API key authentication, key management, users, roles, account scope
  collections/   # Collection schemas, repository, service, routes
  fields/        # Field definitions and category metadata
  items/         # Typed values, filtering, repository, routes
  utils/         # Shared database adapter, HTTP helpers, app types
  index.ts       # Worker composition and errors
frontend/
  components/   # Shared forms, record/field editors, shadcn-vue source
  composables/  # In-memory sign-in state, cancellable loading
  lib/          # Typed API client and value conversion
  pages/        # Accounts, collections, records and fields
  main.ts       # Vue and browser router
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

Repositories own domain SQL; services own rules that need more than request-schema validation. Database and identity-verifier factories can be injected into `createApp` for testing. The frontend reuses type-only imports from the API schemas; no Worker runtime or database modules are shipped to the browser. `components.json` configures the shadcn-vue component registry for future additions; UI source and CSS tokens are kept local for later redesign.
