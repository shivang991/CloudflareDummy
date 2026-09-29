# Dummy Cloudflare Worker CRUD API

A small public JSON API backed by Neon PostgreSQL. Authentication is intentionally left as a hook in `src/auth.ts` for a later Google OAuth integration.

## Setup

```sh
npm install
```

This workspace already has the supplied connection string in the ignored `.dev.vars` file. In a fresh checkout, copy `.dev.vars.example` to `.dev.vars` and replace its placeholder URL.

Create the table and start the Worker:

```sh
npm run db:migrate
npm run dev
```

In another terminal, run `npm run smoke` to exercise create, list, read, update, validation, and delete against the local Worker. It cleans up its test item.

For deployment, run `npx wrangler secret put DATABASE_URL` and then `npm run deploy`. The database URL belongs in Wrangler secrets, never in `wrangler.jsonc` or source control.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Worker health (does not query the database) |
| GET | `/api/items` | List newest 100 items |
| POST | `/api/items` | Create an item |
| GET | `/api/items/:id` | Read an item |
| PUT | `/api/items/:id` | Replace title and description |
| DELETE | `/api/items/:id` | Delete an item |

POST and PUT accept JSON like `{ "title": "Example", "description": "Optional" }`. IDs are UUIDs. The API currently permits anonymous access; wire token or session verification into `authenticate()` before using it with real data.
