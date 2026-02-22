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
- Worker now publishes pending outbox events one-by-one and marks each as `SENT` or `FAILED`.
- For local failure simulation, set `OUTBOX_FAIL_EVENT_TYPE=<EventType>` before running `worker:outbox`.
