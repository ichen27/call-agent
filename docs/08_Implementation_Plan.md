# Implementation Plan (MVP)

## Milestone 0 — Foundations
- Repo setup + CI (lint/test/build)
- Env config + secrets management
- Provision Postgres + Redis
- Deployment scaffolding (Docker + reverse proxy)

**Dependencies:** hosting + domain/SSL.

---

## Milestone 1 — Order Service (Source of truth)
- DB schema + migrations
- Endpoints:
  - POST /orders (idempotency)
  - GET /orders, GET /orders/{id}
  - PATCH /orders/{id} (status transitions)
  - POST /orders/{id}/ack
  - GET /stores/{id}/events (catch-up)
- Audit events for all mutations
- Outbox event write in same transaction
- RBAC middleware + JWT auth for staff endpoints

**Dependencies:** store bootstrap data.

**Status (current):**
- Done:
  - Async API error middleware/wrapping added.
  - JWT login/me endpoints and role-based route guard middleware added (staff/manager).
  - Route-level auth integration tests added for required auth (`401`), role rejection (`403`), and optional auth mode.
  - Auth defaults hardened: non-local environments enforce auth by default unless explicitly disabled.
- Next:
  - Persisted staff user storage and secure password hashing workflow.
  - Expand auth integration coverage to include telephony/internal endpoint policy and store-to-token scoping checks.

---

## Milestone 2 — Realtime + Staff UI (Instant visibility)
- Realtime Gateway (WS):
  - subscribe by store
  - push events
  - ACK support (recommended)
- Outbox Worker:
  - poll pending outbox
  - publish via Redis channel store:{id}
  - retries/backoff; mark SENT/FAILED
- Staff Web App:
  - Login
  - Orders board + real-time updates
  - Order detail + actions
  - Connection status + reconnect + catch-up sync
  - Alerts (sound + banner)

**Dependencies:** event payload contract.

---

## Milestone 3 — Menu + Store Controls (Ops levers)
- Menu import tool (CSV/JSON)
- GET /menu
- Toggle availability (86)
- Store mode endpoint (open/busy/closed)
- Staff UI screens for controls + 86 toggles

**Dependencies:** menu import format + manager user.

---

## Milestone 4 — Voice Service (Telephony + Agent)
- Telephony webhooks:
  - inbound start
  - status callbacks
  - media stream connection
- Agent orchestrator:
  - deterministic state machine
  - menu validation tool calls
  - confirmation step required
  - create order via Order Service
- Warm transfer with structured handoff summary
- Call session logging (call_sessions)

**Dependencies:** telephony provider + store phone routing.

---

## Milestone 5 — Hardening & Fallback Logistics
- Chaos tests for retries, duplicates, disconnects
- Optional fallback notification:
  - if no staff ACK within X seconds → notify manager (SMS/push)
- Rate limiting + webhook signature validation
- Basic analytics events + daily summary job

**Dependencies:** manager contact list.

---

## Milestone 6 — Documentation & Runbooks
- Onboarding guide (store/menu/users)
- Staff training guide (ack/accept/status)
- Incident playbook:
  - disable agent
  - realtime outage procedure
  - order intake disable

---

## Milestone 7 — Persistence Adapter Cutover
- Introduce repository interfaces for storage operations used by API + voice flows
- Implement Postgres-backed repository behind the same interfaces
- Add migrations and seed/bootstrap scripts
- Preserve API contracts while switching runtime storage from in-memory to Postgres

**Dependencies:** DB provisioning + migration strategy.

**Status (current):**
- Done:
  - Repository interface added and memory store migrated to interface.
  - Postgres store async implementation scaffolded with transactional order/idempotency/event/outbox behavior.
  - Migration runner + initial SQL migration file added.
  - Express request flow converted to async repository calls.
  - Postgres backend enabled for HTTP runtime via `STORE_BACKEND=postgres`.
- Next:
  - Extend Postgres integration tests from repository-level to full API route coverage.
  - Harden failure handling and retry semantics around async DB operations.

---

## Milestone 8 — Outbox Worker + Delivery Reliability
- Run dedicated outbox worker process
- Poll pending outbox events and publish to transport layer
- Mark sent/failed with retry/backoff metadata
- Add failure visibility and operational controls for backlog management

**Dependencies:** persistent outbox table + event transport (Redis/queue).

**Status (current):**
- Done:
  - Outbox worker entrypoint added for mark-sent loop step.
  - Worker now processes pending rows per-event and marks sent/failed state explicitly.
  - Retry/dead-letter policy added with exponential backoff scheduling metadata.
- Next:
  - Add transport publishing (Redis/queue) and failure alerts/metrics.

---

## Task Breakdown (suggested)
- Backend: Order Service + Menu/Store Service + Auth
- Infra: DB/Redis + deploy + certs
- Realtime: WS gateway + outbox worker
- Frontend: Staff UI screens + websocket client + alerts
- Voice: telephony integration + state machine + tools
- QA: test harness + E2E scripts
