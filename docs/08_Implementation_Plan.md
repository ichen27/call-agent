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

## Task Breakdown (suggested)
- Backend: Order Service + Menu/Store Service + Auth
- Infra: DB/Redis + deploy + certs
- Realtime: WS gateway + outbox worker
- Frontend: Staff UI screens + websocket client + alerts
- Voice: telephony integration + state machine + tools
- QA: test harness + E2E scripts
