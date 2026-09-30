# Dummy Cloudflare Worker CRUD API

A JSON API built with Hono and backed by Neon PostgreSQL. Item routes require a Google ID token in an HTTP bearer header.

## Setup

```sh
npm install
```

This workspace already has the supplied connection string in the ignored `.dev.vars` file. In a fresh checkout, copy `.dev.vars.example` to `.dev.vars` and replace its placeholder URL. Add `GOOGLE_CLIENT_ID` to `.dev.vars` as described below.

Create the table and start the Worker:

```sh
npm run db:migrate
npm run dev
```

Run `npm test` to exercise create, list, read, update, validation, and delete with Vitest. The tests call the Worker app directly and use an in-memory database stub, so they do not need a running Worker or database. Run `npm run lint`, `npm run typecheck`, and `npm run format:check` for the other checks. Run `npm run format` to apply Prettier formatting.

For deployment, run `npx wrangler secret put DATABASE_URL`, `npx wrangler secret put GOOGLE_CLIENT_ID`, and then `npm run deploy`. Keep `.dev.vars` and the database URL out of source control.

## Google credential setup

1. In [Google Cloud Console](https://console.cloud.google.com/auth/clients), create or select a project and configure the OAuth consent screen (Google Auth Platform branding and audience). Add test users if the app is in testing mode.
2. Create an OAuth client of type **Web application**. Add the frontend's origin under **Authorized JavaScript origins** (for local development, add `http://localhost` and the exact port origin, such as `http://localhost:5173`). Copy the **client ID**, which ends in `.apps.googleusercontent.com`. An OAuth client secret or service account key is not needed for this bearer token flow.
3. Set `GOOGLE_CLIENT_ID="<copied client ID>"` in the ignored `.dev.vars` file alongside `DATABASE_URL`. For a deployed Worker, run `npx wrangler secret put GOOGLE_CLIENT_ID` and enter that same ID. The client ID used by the frontend to obtain the token must match this value.
4. Use [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/display-google-one-tap) in the frontend to sign the user in. Its credential callback supplies an **ID token** in `response.credential`. Send that value with each API call:

   ```js
   fetch("https://YOUR_WORKER_URL/api/items", {
     headers: { Authorization: `Bearer ${response.credential}` },
   });
   ```

   For a manual request with an existing ID token: `curl -H "Authorization: Bearer $GOOGLE_ID_TOKEN" http://localhost:8787/api/items`.

The Worker verifies Google's signature and the token's audience, issuer, and expiration against Google's rotating public keys. Google OAuth **access tokens** are for Google APIs and are not accepted here. Missing or invalid tokens return HTTP 401. `/health` and `/openapi.json` remain public. Authentication does not restrict users to a particular Google account or Workspace domain; any Google account with a valid ID token for the configured client can access the shared item collection.

## API

| Method | Path             | Purpose                                     |
| ------ | ---------------- | ------------------------------------------- |
| GET    | `/health`        | Worker health (does not query the database) |
| GET    | `/api/items`     | List newest 100 items                       |
| POST   | `/api/items`     | Create an item                              |
| GET    | `/api/items/:id` | Read an item                                |
| PUT    | `/api/items/:id` | Replace title and description               |
| DELETE | `/api/items/:id` | Delete an item                              |
| GET    | `/openapi.json`  | OpenAPI 3.0 contract for client generation  |

POST and PUT accept JSON like `{ "title": "Example", "description": "Optional" }`. IDs are UUIDs.

The OpenAPI document is generated from the route and Zod schemas. Fetch `/openapi.json` from a running Worker to use it in an Android or web client repository.
