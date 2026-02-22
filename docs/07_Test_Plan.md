# Test Plan (MVP)

## Unit Tests

### Order Service
- Totals consistency (subtotal/tax/fees/total)
- Status transition validation (reject invalid transitions)
- Idempotency key behavior:
  - same key → same order_id
  - new key → new order created
- Audit events appended for:
  - ORDER_CREATED
  - STATUS_CHANGED
  - ACKED

### Menu/Store Service
- 86 toggle persistence + retrieval
- Store mode change writes outbox event

### Voice Agent State Machine
- No order created without explicit confirmation
- Ambiguous item triggers disambiguation
- Delivery request triggers transfer/decline behavior (config)
- Closed mode blocks ordering

---

## Integration Tests
- Transaction + outbox:
  - create order → outbox row exists in same commit
  - worker publishes and marks SENT
  - transport publisher returns failure on non-2xx webhook responses
  - worker ws-transport publish hits realtime endpoint and returns delivered client count
- Auth/RBAC:
  - protected route without bearer token returns 401 when auth enforcement enabled
  - STAFF token can access staff routes but receives 403 for manager-only routes
  - login verifies PBKDF2 credential hashes from persistent user storage
  - authenticated token from store A gets 403 for store B resources
  - telephony/internal routes return 401 when service-token enforcement env vars are enabled
  - telephony webhook signature validation rejects missing/invalid HMAC and accepts valid signed payload
- Realtime:
  - publish OrderCreated → WS clients receive event
- Reconnect catch-up:
  - disconnect client → create orders → reconnect → fetch events since last id
- Concurrency:
  - simultaneous PATCH updates handled deterministically (last write wins or optimistic locking)

---

## End-to-End (E2E) Tests
- Simulated call:
  1) Start call session
  2) Provide utterances
  3) Confirm order
  4) Verify order persisted in DB
  5) Verify staff UI receives WS event and renders
- Staff workflow:
  - login → ack → accept → in progress → ready → completed
  - websocket disconnect/reconnect reflects latest order state after replay sync

---

## Edge Cases (must test)
- Provider retries inbound webhook → no duplicate orders
- Agent crash mid-call → no partial order created
- Realtime gateway down → order still visible via polling/refresh
- Tablet offline → reconnect sync, no missed orders
- Item 86 mid-call:
  - before confirmation agent blocks item and offers alternative
- Large orders (set max items for MVP, e.g., 30) and UI performance
- Unclear phone/name:
  - reprompt N times; then transfer
- Phone number formatting variations (normalize to E.164 if possible)
