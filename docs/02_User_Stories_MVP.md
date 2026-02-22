# User Stories (MVP) with Acceptance Criteria

## Customer (Caller)

### US-C1: Place a pickup order by phone
**As a** caller, **I want** to order items for pickup, **so that** I don’t need staff to answer.

**Acceptance Criteria**
- Agent collects name + phone and at least one item.
- Agent reads back the full order and requires explicit “yes” confirmation.
- On confirmation, order is created and order number is spoken to caller.
- If caller cancels before confirmation, no order is created.

### US-C2: Clarify ambiguous item
**As a** caller, **I want** the agent to ask clarifying questions when needed.

**Acceptance Criteria**
- If agent cannot map an item to a single menu item above threshold, it asks a disambiguation question with up to 2–3 options.
- If unresolved after 2 attempts, agent offers warm transfer to staff.

### US-C3: Ask to speak to staff
**Acceptance Criteria**
- Caller can say “staff/representative” and agent initiates warm transfer.
- Staff UI shows a “handoff” card with summary (caller name/phone + partial draft if present).

## Staff

### US-S1: See new orders immediately
**As** staff, **I want** new orders to appear instantly so I can begin preparation.

**Acceptance Criteria**
- New orders appear on all connected staff clients within <1s (p95) after creation.
- UI plays alert sound and shows visible “NEW” badge.
- Staff can acknowledge (Ack). Ack is persisted as an audit event.

### US-S2: Accept or reject an order
**Acceptance Criteria**
- Staff can set status to Accepted or Rejected.
- Reject requires a reason (dropdown) and optional notes.
- Status change propagates to other clients within <1s.

### US-S3: Update order status through workflow
**Acceptance Criteria**
- Staff can move order through: Accepted → In Progress → Ready → Completed.
- Each transition is appended to audit log with staff user id and timestamp.

### US-S4: Call customer
**Acceptance Criteria**
- “Call customer” opens the device dialer with stored phone number (`tel:` link).

## Manager

### US-M1: Toggle store mode (Open/Closed/Busy)
**Acceptance Criteria**
- Manager can set store mode.
- Mode update propagates to staff UI immediately.
- Voice agent behavior changes immediately:
  - Busy increases quoted prep time
  - Closed stops ordering (offers info/transfer)

### US-M2: 86 an item (out-of-stock)
**Acceptance Criteria**
- Manager toggles item availability.
- Voice agent stops accepting item within seconds.
- If requested after 86, agent explains unavailable and offers alternatives.
