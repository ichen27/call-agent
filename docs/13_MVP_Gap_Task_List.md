# MVP Gap Evaluation and Task List

Date: 2026-02-22

## Current Snapshot

- Backend core is implemented and healthy in local CI (`npm run ci` passes).
- Postgres integration suites are present but skipped unless `DATABASE_URL` is set.
- Staff web app shell exists and supports login, basic live order listing, ack/status actions, and manager controls.
- Realtime gateway, outbox tables, and worker publish transports exist.

## Reality vs MVP Requirements

### 1) Order + API contract

- Implemented:
  - Idempotent create order flow and status transitions.
  - Order events + outbox appends.
  - Auth login/me, RBAC middleware, and token store scoping on several routes.
- Gaps:
  - Missing endpoint: `GET /api/stores/{store_id}` (in `docs/05_API_Spec.md`).
  - `GET /api/orders` does not enforce token store scope.
  - `GET /api/orders/{order_id}` is not role-protected and does not enforce token store scope.
  - `PATCH /api/orders/{order_id}` does not support reject reason / notes / promised time fields.
  - API and schema docs are richer than current schema/response payloads (contract drift).

### 2) Voice agent flow

- Implemented:
  - Deterministic state machine and explicit yes-confirm before create.
  - Item validation and disambiguation branch.
  - Staff handoff path for several intents.
- Gaps:
  - Readback is incomplete (item count only, not full order summary).
  - No modifier/special-instruction collection.
  - Busy mode behavior not implemented (quoted prep-time adjustment).
  - Disambiguation retry policy does not match 2-attempt requirement.
  - No structured handoff card/event for staff UI.
  - No configurable delivery policy beyond simple transfer prompt.

### 3) Staff UI

- Implemented:
  - Login, live board, websocket status, ack and main status actions.
  - Basic manager mode and item availability controls.
- Gaps:
  - No order detail drawer/modal with full items/events/audit.
  - No reject-with-reason workflow.
  - No `tel:` customer call action.
  - No unread persistence or durable event cursor in local/session storage.
  - No polling fallback while WS disconnected.
  - No automated frontend tests.

### 4) Realtime + outbox reliability

- Implemented:
  - Realtime publish endpoint and websocket fanout.
  - Retry/backoff/dead-letter outbox state machine.
- Gaps:
  - Outbox worker runs once per invocation (not long-running daemon/loop supervisor mode).
  - No delivery acknowledgement contract beyond HTTP success.
  - No shared-broker scaling path (acceptable for pilot, not full production MVP).

### 5) Security, ops, and launch readiness

- Implemented:
  - JWT auth, RBAC, optional service tokens, telephony HMAC verification.
  - Structured logging with basic redaction.
- Gaps:
  - No rate limiting on public endpoints.
  - No feature flags documented in launch plan (`agent_enabled`, `order_intake_enabled`) implemented in code.
  - No metrics/tracing/dashboard implementation (docs only).
  - Security checklist and launch definition-of-done remain mostly unchecked.

### 6) Test completeness

- Implemented:
  - Strong unit and route integration coverage for core backend paths.
- Gaps:
  - DB-backed tests are not part of default CI in environments without database.
  - No reconnect-catchup + polling fallback integration coverage.
  - No full E2E workflow test for staff web app.

## Prioritized Task List to Reach Full Working MVP

## P0 - Contract and Safety (must complete first)

- [ ] Enforce auth + store scope on all store-bound read routes:
  - `GET /api/orders`
  - `GET /api/orders/{order_id}`
  - any remaining store-bound endpoints
- [ ] Add `GET /api/stores/{store_id}` endpoint matching API spec.
- [ ] Extend `PATCH /api/orders/{order_id}` to support:
  - reject reason (required for `REJECTED`)
  - optional note
  - optional promised time update with validation
- [ ] Add tests covering all above auth/scope/validation behaviors.

## P0 - Voice flow completion

- [ ] Expand state machine to collect and read back:
  - item names, quantities, modifiers, special instructions
  - customer name and phone confirmation
- [ ] Implement busy mode behavior impact on quoted prep messaging.
- [ ] Align ambiguous-item flow to max two clarification attempts then handoff.
- [ ] Emit structured handoff summary event for staff consumption.
- [ ] Add telephony tests for each edge path.

## P0 - Staff workflow completion

- [ ] Build order detail drawer/modal with full order + audit trail fetch.
- [ ] Add reject action with mandatory reason and optional note.
- [ ] Add `Call customer` (`tel:` link) control.
- [ ] Add visible unread/acked state and event-cursor persistence.
- [ ] Add disconnect polling fallback and reconnect catch-up robustness.
- [ ] Add frontend tests for critical status and reconnect workflows.

## P1 - Reliability hardening

- [ ] Run outbox worker continuously (or scheduled loop) with graceful shutdown.
- [ ] Add operational controls for dead-letter replay and failure inspection.
- [ ] Add stronger publish delivery semantics (idempotent consumer key and ack metadata).
- [ ] Add integration tests for worker -> realtime browser delivery path.

## P1 - Security and abuse controls

- [ ] Add rate limiting for telephony and public API surfaces.
- [ ] Harden non-local auth defaults and startup validation for required secrets.
- [ ] Add negative tests for abuse/rate-limit and secret misconfiguration paths.

## P1 - Observability and launch controls

- [ ] Implement MVP metrics (orders, outbox backlog, ws connections, failures).
- [ ] Add trace/request correlation IDs through key flows.
- [ ] Implement launch rollback feature flags:
  - `agent_enabled`
  - `order_intake_enabled`
- [ ] Wire and validate dashboards/alerts from `docs/09_Observability_Plan.md`.

## P2 - Product/ops completeness

- [ ] Add menu import tooling and manager workflow for seed/update.
- [ ] Add onboarding and staff operations docs for pilot execution.
- [ ] Reconcile schema/API docs with implemented payloads (or update code to match docs).
- [ ] Add frontend build/test checks to root CI or an equivalent enforced pipeline.

## Suggested Execution Order

1. P0 Contract and Safety
2. P0 Voice flow completion
3. P0 Staff workflow completion
4. P1 Reliability hardening
5. P1 Security + Observability + launch flags
6. P2 Product/ops completeness

## MVP Exit Criteria (practical)

MVP is ready when all P0 items are complete and the following are true in staging:

- `call -> confirm -> order created -> staff sees event` within target latency.
- Staff can `Ack`, `Accept/Reject (reason)`, and complete workflow without data loss.
- Disconnect/reconnect does not miss orders.
- Telephony retries and duplicate callbacks do not create duplicate orders.
- Rollback flags can safely disable automation without losing staff visibility.
