# Product Requirements Document (PRD) — Restaurant Phone Order Agent (MVP)

## Assumptions
1. **MVP scope = pickup orders only.** Delivery requests are handled by warm transfer to staff or politely declined (configurable).
2. **No payment processing in MVP.** Orders are “Pay at pickup.”
3. **No POS integration in MVP.** Staff can re-enter into POS; architecture supports later integration.
4. **Menu is provided upfront** (CSV/JSON import). MVP includes availability toggles (86) and store mode (open/busy/closed), not a full editor.
5. Staff uses a **web app** (tablet/desktop) with **real-time updates via WebSockets** (fallback polling optional; SMS fallback optional).
6. Multi-store supported in data model; MVP can launch with one store.
7. English only (MVP).
8. Transcripts stored for troubleshooting; call recording off by default (jurisdiction-dependent).

## Problem Statement
Restaurants miss revenue and frustrate customers when staff can’t answer phones during rush. Manual order taking is disruptive and error-prone. We need a phone agent that can take accurate pickup orders and make them **visible to staff immediately**.

## Objectives
- Automatically take pickup orders over the phone with high accuracy.
- New orders appear in staff UI within **< 1 second (p95)** after customer confirmation.
- Provide operational controls (open/closed/busy, item 86) that affect agent behavior instantly.
- Provide reliability (no lost orders) and auditability.

## Non-goals (MVP)
- Delivery ordering end-to-end (address validation, zones, dispatch).
- Card payments via phone.
- POS integration.
- Full menu editing UI.

## Personas
- **Caller (Customer):** wants to place a pickup order quickly and accurately.
- **Front Counter Staff:** needs orders instantly, and a simple workflow to accept/prepare.
- **Manager/Owner:** needs store controls (mode/86) and basic performance visibility.

## Key User Journeys (MVP)

### Journey A: Caller places a pickup order (fully automated)
1. Caller calls store number.
2. Agent greets and confirms pickup ordering.
3. Agent takes items, quantities, modifiers, special instructions.
4. Agent reads back summary and requests explicit confirmation.
5. Agent creates order and provides order number + pickup estimate.
6. Staff UI receives order instantly with alert.

### Journey B: Staff handles new order
1. Staff sees “NEW” order appear with sound/banner.
2. Staff reviews details and clicks **Accept** (or Reject with reason).
3. Staff updates status through workflow.

### Journey C: Manager sets busy mode / 86 item
1. Manager toggles **Busy** mode (increases quoted prep times).
2. Manager 86’s an item (agent stops offering it immediately).
3. Changes propagate to agent + staff UI instantly.

## Functional Requirements

### Phone Agent
- Answer inbound calls with branded greeting.
- Determine intent: **order**, **hours/info**, **talk to staff**.
- Take pickup orders:
  - Name + phone
  - Items, quantities, modifiers
  - Special instructions
- Validate against menu and availability.
- Read-back confirmation required before submission.
- Escalate/warm-transfer to staff on:
  - low-confidence mapping,
  - delivery request (per assumptions/config),
  - caller requests staff,
  - caller upset/abusive.
- Optional SMS confirmation receipt (feature flag).

### Staff UI
- Live Orders Board with **instant new order appearance**.
- Audible + visual alert on new orders; require **Ack**.
- Status transitions:
  - **NEW → ACCEPTED → IN_PROGRESS → READY → COMPLETED**
  - **REJECTED** and **CANCELED** available (staff/system).
- Order detail view with items/modifiers, notes, phone, timestamps, audit trail.
- One-tap “Call customer”.
- Store controls:
  - Open/Busy/Closed
  - Item availability toggles (86).

### Admin/Management (MVP minimal)
- User management (seeded manually if desired).
- Store config: phone number(s), default prep times, business hours (static for MVP).
- Minimal analytics: call count, order count, transfer rate, avg handling time, rejection reasons.

## Non-Functional Requirements
- **Latency:** Order appears in staff UI within **< 1s (p95)**.
- **Durability:** Transactional order creation; **no lost orders**.
- **Availability:** Real-time updates with reconnect and catch-up; fallback polling optional.
- **Auditability:** All order state changes appended to audit log.
- **Security:** TLS, RBAC, least privilege, secure secret storage.

## Constraints & Risks
- Speech recognition errors in noisy environments → mitigated via confidence gating + confirmation.
- Menu complexity → structured menu model + constraints.
- Tablet network drops → reconnect + catch-up via events endpoint.
- Recording laws vary → recording off by default; configurable notice.

## Success Metrics (MVP)
- % of order-intent calls resulting in created order without staff correction (baseline + target after pilot).
- Staff UI order visibility latency **p95 < 1s**.
- Duplicate order rate **< 0.1%** (via idempotency).
- Reduced missed calls vs baseline.
