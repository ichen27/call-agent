# Changelog

## Unreleased

### Added

- Core MVP backend service with Express routes for health, menu, store mode, orders, order events, and telephony webhooks.
- Deterministic voice order state machine with controlled tool execution (`get_store_mode`, `validate_item`, `create_order`, `handoff`).
- In-memory domain store for menu, store mode, call sessions, orders, idempotency keys, and append-only order events.
- Initial test coverage for order idempotency/status transitions and telephony confirmation duplicate protection.
- Agent workflow scaffolding: `agents/` role routing + handoff contract.
- Prompt templates under `prompts/` for task briefs, implementation plans, risk checks, reviews, and PR summaries.
- Order detail endpoint implementation: `GET /api/orders/{order_id}` returning order + associated event history.
- In-memory outbox surface (`/api/internal/outbox`, `/api/internal/outbox/publish`) to model outbox lifecycle before persistent infrastructure.
- Unit tests for outbox creation and publish behavior in `tests/memoryStore.test.ts`.
- Postgres migration scaffolding (`migrations/0001_init.sql`, `npm run migrate`).
- Async Postgres repository implementation scaffold (`src/store/postgres.ts`) with transactional create/idempotency/event/outbox methods for upcoming runtime cutover.
- Outbox worker entrypoint (`npm run worker:outbox`) for pending->sent flow in postgres mode.
- Outbox publisher abstraction (`src/workers/publishers.ts`) with stdout transport placeholder.
- Store factory selection layer (`src/store/factory.ts`) and tests for backend selection behavior (`tests/storeFactory.test.ts`).
- Postgres repository integration test suite (`tests/postgresStore.integration.test.ts`) for idempotency, transitions, replay, and outbox state updates.
- Outbox batch runner policy module (`src/workers/outboxRunner.ts`) with exponential retry scheduling and dead-letter routing.
- Outbox worker policy tests (`tests/outboxRunner.test.ts`).
- Follow-up migration (`migrations/0002_outbox_backoff.sql`) to add `next_attempt_at` scheduling field for existing databases.
- JWT auth service + middleware (`/api/auth/login`, `/api/auth/me`) with role-aware route protection scaffolding.
- Auth service tests (`tests/authService.test.ts`).
- Route-level auth integration tests (`tests/authRoutes.test.ts`) for `401`/`403`/optional-auth behavior.

### Changed

- `AGENTS.md` now reflects repository truth, command hooks, task modes, and stop-and-ask gates for this codebase.
- Storage usage in services is now interface-driven (`AppRepository`) instead of hard-coupled to `MemoryStore`, enabling cleaner Postgres cutover.
- Health endpoint now includes backend metadata.
- API request path, order service, and voice tool/state-machine flow now use async repository contracts.
- `STORE_BACKEND=postgres` is now supported by the HTTP app runtime (with `DATABASE_URL`).
- Outbox worker flow now marks each event as `SENT` or `FAILED` based on per-event publish result.
- API routing now uses centralized async error capture and shared error middleware for safer async failure handling.
- Outbox storage/worker flow now supports `DEAD_LETTER` status and due-time filtering (`next_attempt_at`) for retry control.
- Protected order/mode/menu routes now support RBAC enforcement (`STAFF`/`MANAGER`) with configurable `AUTH_REQUIRED` mode.
- Auth enforcement defaults are now environment-aware: required outside local/test unless explicitly overridden.

### Fixed

-

### Security

- Added explicit workflow guardrails for sensitive logging, API contract risk, idempotency, and telephony state-machine safety.
