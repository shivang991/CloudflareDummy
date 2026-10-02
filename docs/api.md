# Mini CRM API v2

Local base URL: `http://localhost:8787`. All `/api/*` requests require authentication. Google authentication works on every endpoint:

```http
Authorization: Bearer <Google ID token>
```

Use a **Google ID token** issued for `GOOGLE_CLIENT_ID`. Verification checks the Google signature, RS256 algorithm, issuer, audience, expiration, subject, and verified email. Access tokens are not accepted. Account roles come from Postgres, never from client-supplied claims. There is no password or session endpoint; Google handles sign-in.

Item CRUD and collection reads also accept an account-owned API key through `X-API-Key`. Send either `Authorization` or `X-API-Key`; sending both returns `400`. API keys do not require a Google token on each request.

Requests with bodies must use `Content-Type: application/json`. Unknown body properties are rejected. All IDs are UUIDs. Names are trimmed, nonempty, and at most 200 characters. Request bodies are limited to 256 KiB. Updates use `PATCH`. Deletes return `204` with no body. Creates return `201` and a `Location` header. Dates/timestamps in responses are strings.

The public `GET /openapi.json` document describes every route, request, response, security requirement, and filter shape. `GET /health` returns `{"ok":true}` without accessing the database.

## Accounts and authorization

A verified Google identity may register its own account with `POST /api/users`. This always creates a USER. A provisioned account is linked once when a token has its matching verified email. After linking, the Google subject is the account's identity; changing an email does not transfer the account to another Google subject.

| Method | Path                  | Access / behavior                        |
| ------ | --------------------- | ---------------------------------------- |
| POST   | `/api/users`          | Self registration, or ADMIN provisioning |
| GET    | `/api/users/me`       | Current registered account               |
| GET    | `/api/users`          | ADMIN only; paginated account list       |
| GET    | `/api/users/{userId}` | ADMIN any account; USER own account      |
| PATCH  | `/api/users/{userId}` | ADMIN any account; USER own account      |
| DELETE | `/api/users/{userId}` | ADMIN only; cascades owned CRM data      |

Self registration body:

```json
{ "profile": { "name": "Alex Morgan" } }
```

The optional `email` must match the token's verified email. A USER cannot supply `role`, including on updates. Repeat registration returns `409`. Unregistered identities cannot access CRM resources and receive `403` until registered.

ADMIN provisioning body:

```json
{ "email": "colleague@example.com", "profile": { "name": "Colleague" }, "role": "USER" }
```

An admin may select `ADMIN` explicitly; omitting role creates USER. Provisioning never accepts a Google subject from the client. A provisioned user signs in using the verified Google email above.

Account updates accept `email`, `profile`, and (ADMIN only) `role`. A USER's new email must match their current token's verified email. Profiles are replaced when supplied and accept optional `name` (max 200 characters) and `avatar_url` (URL, max 2000 characters). Email uniqueness is case-insensitive through normalization. A user response is:

```json
{
  "user": {
    "id": "123e4567-e89b-42d3-a456-426614174000",
    "email": "alex@example.com",
    "profile": { "name": "Alex Morgan" },
    "role": "USER",
    "created_at": "2026-10-01T00:00:00Z",
    "updated_at": "2026-10-01T00:00:00Z"
  }
}
```

## Account scope and “Act as”

Collection, field, and item endpoints default to the caller's account. A Google-authenticated ADMIN accesses another account by adding `?actAs=<userId>` on **each request**. This selects the resource owner; the caller remains the admin. IDs do not override scope. This parameter is never accepted from a USER or an API key, even if it names their own account. A nonexistent target account returns `404`.

```sh
curl -H "Authorization: Bearer $ID_TOKEN" \
  "http://localhost:8787/api/collections?actAs=$USER_ID"
```

Without `actAs`, an admin sees their own collections. Other-account resources return `404` for reads and mutations; user deletion or role assignment without admin rights returns `403`. User administration uses the user ID in the path and does not need `actAs`.

## API keys

Registered users, including admins, can manage keys for their own account using **Google authentication**:

| Method | Path                    | Behavior                                        |
| ------ | ----------------------- | ----------------------------------------------- |
| POST   | `/api/api-keys`         | Create key with `{"name":"Integration"}`        |
| GET    | `/api/api-keys`         | List key metadata; accepts `limit` and `offset` |
| DELETE | `/api/api-keys/{keyId}` | Revoke your key; returns `204`                  |

Create a key:

```sh
curl -X POST "http://localhost:8787/api/api-keys" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Integration"}'
```

The response is `{"api_key":{"id":"...","user_id":"...","name":"Integration","key_prefix":"crm_...","created_at":"..."},"key":"crm_..."}`. Store the `key` securely when created: the full secret is returned only once. Creation and list responses use `Cache-Control: no-store`. Postgres stores only a SHA-256 hash of the randomly generated 256-bit secret, plus a short identifying prefix. List responses return `{"api_keys":[...],"page":{...}}` without secrets or hashes. Keys remain valid until revoked or their owner account is deleted. To rotate, create a new key, update the integration, then delete the old key.

Use the key on collection list/detail reads or item list/create/read/update/delete:

```sh
curl "http://localhost:8787/api/collections" \
  -H "X-API-Key: $API_KEY"

curl -X POST "http://localhost:8787/api/collections/$COLLECTION_ID/items" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"values":[]}'
```

Keys access only their owner's collections and items. They cannot use `actAs`, even when the owner is an admin. Collection mutations, separate field endpoints, user endpoints, and key management return `403` when authenticated with a valid API key. Collection reads already include field definitions. Existing pagination, filtering, value validation, and deletion rules also apply to key-authenticated requests. Missing, malformed, unknown, or revoked keys return `401`; other-account resources return `404`. A key belonging to another account cannot be revoked or listed, including by admins.

Apply the additive schema with `npm run db:migrate` before using this feature. No additional Worker secrets are needed. Admins can also manage their own keys through the dashboard's **API keys** sidebar page at `/admin/api-keys`. The page lists key metadata, displays a new secret once with a copy button, and confirms revocation. It manages the signed-in admin's keys; opening another account's workspace does not change key ownership.

## Collections

| Method | Path                              | Behavior                                                  |
| ------ | --------------------------------- | --------------------------------------------------------- |
| GET    | `/api/collections`                | List selected account's collections, including fields     |
| POST   | `/api/collections`                | Create collection with optional field definitions         |
| GET    | `/api/collections/{collectionId}` | Read collection and its fields                            |
| PATCH  | `/api/collections/{collectionId}` | Update name and/or apply field change set atomically      |
| DELETE | `/api/collections/{collectionId}` | Delete collection, its fields, options, items, and values |

Create:

```sh
curl -X POST "http://localhost:8787/api/collections" \
  -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Contacts","fields":[
    {"name":"Name","type":"TEXT"},
    {"name":"Revenue","type":"NUMBER"},
    {"name":"Active","type":"BOOL"},
    {"name":"Follow up","type":"DATE"},
    {"name":"Status","type":"CATEGORY","options":[
      {"name":"Lead","default":true},{"name":"Customer"}
    ]},
    {"name":"Assigned to","type":"USER"}
  ]}'
```

The response is `{"collection":{...}}` with `id`, `user_id`, `name`, `created_at`, `updated_at`, and `fields`. Each field includes `id`, `collection_id`, `name`, `type`, `relation_collection_id` (null unless RELATION), and `options` (empty unless CATEGORY). Category options include `id`, `field_id`, `name`, and `default`. Use the returned IDs in item values.

Collection updates accept **only** `name` and `fields`. The collection ID and owner cannot change. Field changes use explicit operations; omitted definitions are retained:

```json
{
  "name": "Leads",
  "fields": {
    "add": [{ "name": "Website", "type": "TEXT" }],
    "rename": [{ "id": "123e4567-e89b-42d3-a456-426614174001", "name": "Contact name" }],
    "delete": ["123e4567-e89b-42d3-a456-426614174002"]
  }
}
```

Each operation array is optional. A field ID may appear only once in the rename/delete operations. Rename/delete IDs must belong to the selected collection. The entire change rolls back on invalid references or duplicate names. Deletion removes values for that field. Field names must be unique within a collection (case-sensitive). Create requests accept up to 100 fields, and change sets accept up to 100 entries per operation.

## Fields (through collections)

| Method | Path                                               | Behavior                              |
| ------ | -------------------------------------------------- | ------------------------------------- |
| GET    | `/api/collections/{collectionId}/fields`           | Return `{"fields":[...]}`             |
| POST   | `/api/collections/{collectionId}/fields`           | Add a field; return `{"field":{...}}` |
| GET    | `/api/collections/{collectionId}/fields/{fieldId}` | Read one field                        |
| PATCH  | `/api/collections/{collectionId}/fields/{fieldId}` | Rename using `{"name":"New name"}`    |
| DELETE | `/api/collections/{collectionId}/fields/{fieldId}` | Delete definition and its values      |

Both USER and ADMIN use these collection-scoped endpoints. The field type, options, and relation target are **immutable** after creation. To change them, delete and recreate the field; its previous values will be removed.

| Type     | Creation configuration                                    | Item value                                          |
| -------- | --------------------------------------------------------- | --------------------------------------------------- |
| TEXT     | None                                                      | String, max 10,000 characters                       |
| NUMBER   | None                                                      | Finite JavaScript number; Postgres double precision |
| BOOL     | None                                                      | JSON `true` or `false`                              |
| DATE     | None                                                      | ISO 8601 date-time with `Z` or timezone offset      |
| CATEGORY | `options`: 1–100 unique names; at most one `default:true` | Option UUID from this field                         |
| USER     | None                                                      | Existing user account UUID                          |
| RELATION | `relation_collection_id`: collection UUID in same account | Item UUID in the configured target collection       |

Each value is single-valued; CATEGORY, USER, and RELATION are not arrays. Configuration for another type is rejected. A relation field can point to its own collection. A USER reference does not grant permission to read that user's account or collections; it stores an existing account ID. Referenced accounts are checked by foreign key.

A relation definition:

```json
{
  "name": "Company",
  "type": "RELATION",
  "relation_collection_id": "123e4567-e89b-42d3-a456-426614174010"
}
```

New fields do not backfill existing items. Category defaults apply only when creating a new item.

## Items and values

| Method | Path                                             | Behavior                                     |
| ------ | ------------------------------------------------ | -------------------------------------------- |
| GET    | `/api/collections/{collectionId}/items`          | Paginated, optionally filtered list          |
| POST   | `/api/collections/{collectionId}/items`          | Create item and values atomically            |
| GET    | `/api/collections/{collectionId}/items/{itemId}` | Read item and values                         |
| PATCH  | `/api/collections/{collectionId}/items/{itemId}` | Add/update/clear specified values atomically |
| DELETE | `/api/collections/{collectionId}/items/{itemId}` | Delete item and its values                   |

Create body (replace field UUIDs with those returned by the collection):

```json
{
  "values": [
    { "field_id": "123e4567-e89b-42d3-a456-426614174001", "value": "Alex Morgan" },
    { "field_id": "123e4567-e89b-42d3-a456-426614174002", "value": 12500 },
    { "field_id": "123e4567-e89b-42d3-a456-426614174003", "value": false },
    { "field_id": "123e4567-e89b-42d3-a456-426614174004", "value": "2026-10-15T09:00:00-07:00" }
  ]
}
```

`{}` creates an item without explicit values. CATEGORY defaults are filled for omitted category fields; explicit `null` suppresses a default. Unknown fields, type mismatches, and duplicate field IDs return `400`. A request can contain at most 200 values. Numeric strings and boolean strings are not coerced.

PATCH requires a nonempty `values` array. Values are upserted by `(item_id, field_id)`. Omitted fields stay unchanged, and `null` removes a value. Item IDs and collection membership cannot be updated. Invalid references cause the **whole request** to roll back.

```json
{ "values": [{ "field_id": "123e4567-e89b-42d3-a456-426614174001", "value": null }] }
```

Response:

```json
{
  "item": {
    "id": "123e4567-e89b-42d3-a456-426614174020",
    "collection_id": "123e4567-e89b-42d3-a456-426614174000",
    "created_at": "2026-10-01T00:00:00Z",
    "updated_at": "2026-10-01T00:00:00Z",
    "values": [
      {
        "id": "123e4567-e89b-42d3-a456-426614174030",
        "field_id": "123e4567-e89b-42d3-a456-426614174002",
        "type": "NUMBER",
        "value": 12500
      }
    ]
  }
}
```

Unset fields are absent from `values`; empty strings, zero, and false are stored values. DATE values are normalized to UTC and millisecond precision. Category and reference values return IDs, without expanding related resources.

## Filtering and pagination

Account, collection, and item lists accept `limit` (1–100, default 50) and `offset` (0–100,000, default 0). Lists are ordered by creation time descending with ID as a deterministic tie-breaker. Responses include `page: {limit,offset,has_more}`. Offset pagination can shift if data changes between requests. Field lists are unpaginated and ordered by creation time and ID.

Item lists also accept `filters`, a URL-encoded JSON array containing at most 20 filters. All filters are combined with **AND** and must reference fields in the requested collection. Empty arrays apply no filtering.

| Operator                   | Types           | Value                                                     |
| -------------------------- | --------------- | --------------------------------------------------------- |
| `eq`, `ne`                 | All seven types | Exact typed value; ID equality for CATEGORY/USER/RELATION |
| `gt`, `gte`, `lt`, `lte`   | NUMBER, DATE    | Typed number or timestamp                                 |
| `contains`                 | TEXT            | Case-sensitive literal substring; `%` and `_` are literal |
| `is_empty`, `is_not_empty` | All seven types | Omit `value`                                              |

`ne` matches an existing unequal value. It does not match missing values. `is_empty` means no stored value; it does not match `""`, `0`, or `false`. Compare empty text with `eq` and `value:""`. JSON null is not a filter operand; use the empty operators instead.

```sh
curl -G "http://localhost:8787/api/collections/$COLLECTION_ID/items" \
  -H "Authorization: Bearer $ID_TOKEN" \
  --data-urlencode 'limit=25' \
  --data-urlencode 'filters=[{"field_id":"123e4567-e89b-42d3-a456-426614174002","op":"gte","value":10000},{"field_id":"123e4567-e89b-42d3-a456-426614174001","op":"contains","value":"Morgan"}]'
```

Item list responses are `{"items":[...],"page":{...}}`; collection and account lists use `collections` and `users` respectively. Invalid JSON filters, unsupported operators for a type, unknown fields, or mismatched operand types return `400`.

## Errors and deletion rules

Errors use `{"error":"message"}`. Request-schema errors also provide a `details` array of `{path,message}` objects. Responses never expose database internals.

| Status | Meaning                                                                                    |
| ------ | ------------------------------------------------------------------------------------------ |
| 400    | Invalid JSON, IDs, body properties, field metadata, types or filters                       |
| 401    | Missing/invalid Google ID token or API key; Google failures include `WWW-Authenticate`     |
| 403    | Account registration or ADMIN role required, or credentials lack endpoint/scope permission |
| 404    | Missing resource or resource outside selected account                                      |
| 409    | Duplicate email/name or invalid/in-use database reference                                  |
| 413    | Body exceeds 256 KiB                                                                       |
| 500    | Unexpected server/configuration/database failure                                           |

Deleting a field cascades its values. Deleting an item cascades its values but returns `409` if another remaining item's RELATION value points to it. Deleting a collection cascades its fields/items but returns `409` if a remaining relation field points to that collection. Clear the relation values or remove the relation field before deleting its target.

Deleting an account cascades its entire collection graph, including relations internal to that graph. It returns `409` if a remaining item belonging to another account has a USER value referencing the account. Admins can clear those values using `actAs` before deletion. Dangling references and cross-account relation targets are rejected by Postgres constraints as well as API validation.
