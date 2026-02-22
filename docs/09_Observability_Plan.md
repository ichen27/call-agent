# Observability Plan (MVP)

## Logging (Structured)
### Required fields
- timestamp, level, service
- store_id, order_id, call_id
- user_id (staff), request_id/trace_id
- event_type (outbox/realtime)
- latency_ms, status_code

### Key log events
- order_created / order_create_failed
- outbox_publish_attempt / success / failed
- ws_client_connected / disconnected
- call_started / call_transferred / call_ended
- agent_state_transition (debug, sampled)

---

## Metrics
### SLIs / KPIs
- orders_created_total{store_id}
- order_create_latency_ms_p95
- order_visible_latency_ms_p95 (client reported or derived)
- ws_connected_clients{store_id}
- outbox_backlog{store_id}
- outbox_publish_failures_total
- calls_total, calls_transferred_total
- agent_containment_rate
- order_duplicate_prevented_total (idempotency hits)

---

## Tracing
- Distributed tracing: Voice → Menu → Orders → DB → Outbox Worker → Realtime
- Propagate trace_id from inbound webhooks through internal calls

---

## Dashboards
1. **Operations Overview**
   - calls/min, orders/min, status counts
   - ws connected clients
   - outbox backlog
2. **Voice Agent Health**
   - outcomes: order created vs transferred vs failed
   - average call duration
   - errors by state
3. **Realtime Health**
   - publish latency
   - disconnect rate
4. **Reliability**
   - idempotency hits
   - outbox retries

---

## Alerts
- P1: outbox_backlog > threshold for N minutes
- P1: order_create_failed_rate > threshold
- P2: ws_connected_clients drops to 0 during open hours
- P2: order visibility latency p95 > 2s for N minutes
- P2: voice inbound webhook failures spike
