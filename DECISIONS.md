# Decisions

## 2026-02-22 - Adopt Minimal-Core Agent Workflow Scaffold (ADR-0001)

- Status: accepted
- Context:
  - The repository had a generic `AGENTS.md` template with TODO placeholders.
  - We needed workflow modeling based on `CODEX-WORKFLOW-KIT copy.md`, but adapted pragmatically to current repo scope.
- Decision:
  - Adopt a minimal core workflow set now:
    - `AGENTS.md` (repo-truth + gates + command hooks)
    - `agents/README.md`, `agents/HANDOFF-CONTRACT.md`, `agents/orchestrator.md`, `agents/test-engineer.md`
    - `prompts/*.md` workflow templates
  - Defer optional specialist modules (`backend-api`, `ops-observability`, `payments-ledger`, `safety-moderation`) until scope expansion requires them.
- Rationale:
  - Keeps process overhead low for MVP while enforcing clear quality and safety gates.
  - Matches current project footprint (single backend service with API + voice state machine + tests).
- Consequences:
  - Immediate consistency in planning/review/handoffs.
  - Additional specialist roles may still be needed for future cross-cutting or security-heavy work.
- Rollback:
  - Revert workflow docs/files if they create friction; keep only `AGENTS.md` command hooks and core DoD/stop-and-ask sections.

## 2026-02-22 - Keep MVP Runtime In-Memory Before Persistence/Realtimes (ADR-0002)

- Status: accepted
- Context:
  - Product docs target a production architecture with Postgres, Redis, outbox worker, and WebSocket fanout.
  - Current delivery goal is validating core call-to-order behavior quickly with low setup friction.
- Decision:
  - Keep runtime storage in `MemoryStore` for this phase.
  - Implement only core API and telephony state-machine behavior needed for MVP flow simulation.
  - Defer DB migrations, durable outbox, and realtime infrastructure to subsequent milestones.
- Rationale:
  - Enables rapid iteration on API contracts and voice interaction logic before infrastructure lock-in.
  - Reduces operational complexity while behavior and requirements are still moving.
- Consequences:
  - Data is non-durable and process-local.
  - No true multi-instance consistency, no resilient event delivery, and no production-grade replay behavior.
- Rollback:
  - Replace `MemoryStore` behind existing service interfaces with persistent adapters (Postgres + outbox + pub/sub) while preserving endpoint contracts.

## 2026-02-22 - Add In-Memory Outbox Modeling Endpoints Before Worker Integration (ADR-0003)

- Status: accepted
- Context:
  - The target architecture requires transactional outbox publication, but persistent DB/worker layers are not implemented yet.
  - We need a concrete outbox lifecycle shape now to guide later Postgres + worker migration.
- Decision:
  - Introduce outbox event records inside `MemoryStore` for each order-domain event.
  - Add internal/debug endpoints to inspect and publish pending outbox events:
    - `GET /api/internal/outbox`
    - `POST /api/internal/outbox/publish`
- Rationale:
  - Preserves forward-compatible event model and testable behavior without adding infrastructure dependencies in this phase.
- Consequences:
  - Outbox behavior is process-local and non-durable.
  - Internal endpoints are not production-safe and must be protected or removed in hardened environments.
- Rollback:
  - Remove internal endpoints and route publication through dedicated worker once persistent outbox storage is in place.

## 2026-02-22 - Introduce Repository Interface Before Database Cutover (ADR-0004)

- Status: accepted
- Context:
  - Core services and voice tools were directly typed against `MemoryStore`.
  - Upcoming Postgres implementation requires a drop-in replacement without widespread behavioral rewrites.
- Decision:
  - Introduce `AppRepository` as the storage contract for API/service/tool operations.
  - Keep `MemoryStore` as one implementation of this interface.
  - Refactor service/tool wiring to depend on the interface instead of concrete store type.
- Rationale:
  - Lowers migration risk by decoupling business logic from storage implementation.
  - Enables incremental cutover and parallel test coverage for memory and Postgres adapters.
- Consequences:
  - Slightly broader type surface to maintain.
  - Clearer boundaries for persistence and worker phases.
- Rollback:
  - Revert to direct `MemoryStore` coupling if adapter strategy proves unnecessary.

## 2026-02-22 - Stage Postgres as Async Adapter Before App Runtime Switch (ADR-0005)

- Status: accepted
- Context:
  - Current Express handlers and service flow are synchronous and memory-backed.
  - Postgres operations are naturally async and require request path changes to fully cut over.
- Decision:
  - Implement Postgres repository, migration runner, and outbox worker entrypoint now.
  - Keep HTTP runtime on memory backend until async handler conversion is complete.
  - Fail fast if `STORE_BACKEND=postgres` is selected for the current sync app path.
- Rationale:
  - Preserves delivery momentum while reducing risk of a large unsafe one-shot conversion.
  - Enables early schema validation and worker development in parallel.
- Consequences:
  - Temporary dual-backend state with postgres only partially wired.
  - Additional follow-up needed for complete runtime cutover.
- Rollback:
  - Remove postgres scaffolding and revert to memory-only workflow if deployment constraints change.

## 2026-02-22 - Complete Async Repository Cutover for HTTP Runtime (ADR-0006)

- Status: accepted
- Context:
  - Repository contract and postgres adapter existed, but Express runtime was still memory-only due sync handler flow.
- Decision:
  - Convert repository contract and call sites (app routes, order service, voice tools/state machine) to async.
  - Enable repository factory to return Postgres backend for HTTP runtime when configured.
- Rationale:
  - Unblocks true runtime validation of API behavior against persistent storage.
  - Aligns application control flow with database IO semantics.
- Consequences:
  - More async error paths to handle and test.
  - Existing supertest/integration tests still need environment support and DB harness to validate postgres end-to-end.
- Rollback:
  - Force `STORE_BACKEND=memory` in runtime configuration while retaining async interfaces.

## 2026-02-22 - Process Outbox Rows Per Event with Explicit Success/Failure State (ADR-0007)

- Status: accepted
- Context:
  - Previous worker behavior marked outbox batches as sent without transport-aware per-event handling.
- Decision:
  - Introduce publisher abstraction and process pending outbox rows one-by-one.
  - Mark each event as `SENT` on publish success or `FAILED` on publish error.
- Rationale:
  - Establishes failure visibility and deterministic retry targets before integrating real transport.
- Consequences:
  - Worker throughput is currently lower than bulk updates.
  - Retry policy is still minimal and needs dedicated backoff logic in a later phase.
- Rollback:
  - Revert to batch mark-sent worker behavior if per-event processing causes operational issues in early environments.

## 2026-02-22 - Add Centralized Async Error Middleware and DB-Gated Integration Tests (ADR-0008)

- Status: accepted
- Context:
  - Express 4 async handlers can leak unhandled promise rejections without explicit wrapper usage.
  - Postgres runtime support needs integration evidence while keeping local workflows optional.
- Decision:
  - Introduce `asyncRoute` wrapper and shared `errorMiddleware` for centralized API error mapping/logging.
  - Add `test:integration` suite for `PostgresStore`, gated by `DATABASE_URL` presence.
- Rationale:
  - Improves runtime safety under async DB failures and makes persistence behavior regression-testable.
- Consequences:
  - Error code mapping is centralized and easier to evolve.
  - Full API integration testing still requires network-enabled environments due sandbox port restrictions.
- Rollback:
  - Revert wrapper/middleware if route-level handling is preferred, while preserving equivalent rejection safety.

## 2026-02-22 - Persist Retry Scheduling and Dead-Letter Outbox State (ADR-0009)

- Status: accepted
- Context:
  - Per-event worker processing existed, but retry cadence and terminal failure routing were not explicit.
- Decision:
  - Add `next_attempt_at` scheduling metadata for outbox rows.
  - Process only due outbox rows in worker (`status IN PENDING/FAILED AND next_attempt_at <= now()`).
  - Apply exponential backoff and move exhausted events to `DEAD_LETTER`.
- Rationale:
  - Makes retry behavior deterministic and inspectable across worker restarts.
  - Prevents infinite immediate retries on repeatedly failing events.
- Consequences:
  - Adds migration and policy config surface (`OUTBOX_MAX_ATTEMPTS`, `OUTBOX_BASE_DELAY_MS`, `OUTBOX_MAX_DELAY_MS`).
  - Requires future operational metrics/alerts on dead-letter backlog.
- Rollback:
  - Disable due-time filtering and revert to immediate retry loop if staged rollout shows unacceptable latency.
