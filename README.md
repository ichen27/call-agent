# Call Agent MVP

Minimal TypeScript service implementing a call-agent MVP with:
- inbound telephony webhook handling
- deterministic conversation state machine
- safe tool layer with strict validation/allowlist
- idempotent order creation
- menu/store controls and events endpoint
- repository abstraction + Postgres migration/worker scaffolding for persistence cutover

## Run locally

```bash
npm install
npm run dev
```

Healthcheck:

```bash
curl http://localhost:3000/health
```

## Simulate a call

```bash
curl -X POST http://localhost:3000/api/telephony/inbound \
  -H 'content-type: application/json' \
  -d '{"call_id":"CA-local-1","store_id":"store-1","from":"+15551234567","utterance":"hello"}'
```

Repeat `utterance` values in sequence:
`pickup order` → `<name>` → `<menu item>` → `done` → `yes`.

## Auth (current)

- Default mode:
  - `NODE_ENV=development|test` -> auth is optional unless `AUTH_REQUIRED=true`.
  - other environments -> auth enforcement is enabled unless `AUTH_REQUIRED=false`.
- Set `JWT_SECRET` in all non-local environments.

Quick login example:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"store_id":"store-1","email":"manager@store.test","password":"password123"}'
```

Auth user config (`AUTH_USERS_JSON`) accepts either `passwordHash` (preferred) or `password` (hashed at boot):

```json
[
  {
    "userId": "manager-1",
    "storeId": "store-1",
    "email": "manager@store.test",
    "role": "MANAGER",
    "passwordHash": "pbkdf2_sha256$100000$..."
  }
]
```

Service endpoint protection (optional, recommended outside local):
- `INTERNAL_API_KEY`: required in `x-internal-api-key` for `/api/internal/outbox*`.
- `TELEPHONY_WEBHOOK_TOKEN`: required in `x-telephony-token` for `/api/telephony/*`.
- `TELEPHONY_WEBHOOK_SECRET`: requires `x-telephony-signature` HMAC SHA-256 of raw request body.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Persistence modes

Memory backend remains default for local quickstart:

```bash
STORE_BACKEND=memory npm run dev
```

Postgres scaffolding commands:

```bash
STORE_BACKEND=postgres DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db> npm run migrate
STORE_BACKEND=postgres DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db> npm run worker:outbox
```

You can run HTTP API on postgres backend by setting:

```bash
STORE_BACKEND=postgres DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db> npm run dev
```

Outbox worker notes:
- Worker now publishes due outbox events one-by-one and marks each as `SENT`, `FAILED`, or `DEAD_LETTER`.
- For local failure simulation, set `OUTBOX_FAIL_EVENT_TYPE=<EventType>` before running `worker:outbox`.
- Transport options:
  - `OUTBOX_PUBLISH_TRANSPORT=stdout` (default)
  - `OUTBOX_PUBLISH_TRANSPORT=webhook` with `OUTBOX_WEBHOOK_URL` and optional `OUTBOX_WEBHOOK_AUTH_BEARER`
  - Optional webhook timeout: `OUTBOX_WEBHOOK_TIMEOUT_MS` (default `5000`)
- Retry/dead-letter controls:
  - `OUTBOX_MAX_ATTEMPTS` (default `5`)
  - `OUTBOX_BASE_DELAY_MS` (default `1000`)
  - `OUTBOX_MAX_DELAY_MS` (default `60000`)
- Optional worker scope: `OUTBOX_STORE_ID=<store-id>` to process one store.
