# Launch Plan + Rollback Plan (MVP)

## Launch Plan (Staged)

### 1) Internal dry run
- Seed store + menu
- Connect staff UI on test devices
- Simulate calls and confirm:
  - order creation works
  - realtime delivery works
  - ack + accept workflow works

### 2) Pilot store soft launch
- Enable agent only during limited hours (feature flag)
- Staff trained on:
  - acknowledging new orders
  - status workflow
  - handling transfers/handoffs

### 3) Parallel run
- Keep staff line available
- Agent handles calls but can transfer quickly
- Monitor error rates + visibility latency

### 4) Full enable
- Expand hours once stable
- Optional: enable SMS fallback for un-acked new orders

## Pre-launch checklist
- [ ] WebSocket connectivity verified on all staff devices
- [ ] Alert sound audible in operating environment
- [ ] Store mode + 86 toggles confirmed affecting agent behavior immediately
- [ ] Idempotency verified with forced retries
- [ ] Dashboards + alerts configured
- [ ] Feature flags confirmed (`AGENT_ENABLED`, `ORDER_INTAKE_ENABLED`)

---

## Rollback Plan (Fast + safe)

### Goals
- Restore normal operations immediately
- Prevent automated order creation if unstable
- Preserve existing order data

### Steps
1. Flip feature flag `AGENT_ENABLED=false`
   - Telephony routing forwards calls directly to staff line
   - Voice Service either transfers immediately or does not answer
2. Keep Staff UI available for visibility/manual tracking
3. If realtime unstable:
   - Staff UI uses polling fallback
   - Optional SMS fallback for new orders
4. If Order Service unstable:
   - Flip `ORDER_INTAKE_ENABLED=false` (agent cannot create orders)
   - Force calls to transfer to staff

### Rollback validation
- Confirm calls reach staff directly
- Confirm no new automated orders are created
- Confirm system reflects rollback state in logs/metrics

---

## Definition of Done (MVP) Checklist

### Product/UX
- [ ] Caller can place pickup order end-to-end with read-back confirmation
- [ ] Staff sees new orders within <1s p95 after confirmation
- [ ] Staff can Ack, Accept/Reject (with reason), and progress statuses
- [ ] Manager can toggle Open/Busy/Closed and 86 items; agent updates immediately
- [ ] Reconnect behavior works: no missed orders after disconnect

### Engineering
- [ ] Transactional + idempotent order creation
- [ ] Outbox pattern implemented with retries
- [ ] WebSockets per-store subscription + event replay endpoint
- [ ] Telephony integration supports inbound calls and warm transfer

### Quality
- [ ] Unit tests for totals, transitions, idempotency, controls
- [ ] Integration tests for outbox→realtime and reconnect catch-up
- [ ] E2E flow: call → order → staff UI receives → staff completes workflow

### Ops/Monitoring
- [ ] Structured logs with store_id/order_id/call_id
- [ ] Dashboards for orders/calls/ws/outbox
- [ ] Alerts for outbox backlog, order create failures, WS health

### Security/Privacy
- [ ] RBAC, secrets, webhook validation enabled
- [ ] Transcript retention set; recording off by default
