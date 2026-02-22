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

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Persistence scaffolding (phase in progress)

Memory backend remains the default HTTP runtime:

```bash
STORE_BACKEND=memory npm run dev
```

Postgres scaffolding commands:

```bash
STORE_BACKEND=postgres DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db> npm run migrate
STORE_BACKEND=postgres DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db> npm run worker:outbox
```

Current limitation:
- The Express app path is still synchronous and uses memory mode by default.
- `PostgresStore` async methods are implemented and ready for the next app async cutover phase.
