# UX/UI Spec (MVP)

## Screen List
1. **Login**
2. **Orders Board (Live)**
3. **Order Detail (Drawer/Modal)**
4. **Store Controls (Mode + Basic settings)**
5. **Menu Availability (86 toggles)**

## Global UI Requirements
- Must show **connection status** (WS Connected / Reconnecting / Offline).
- Must support **catch-up sync** after reconnect (events endpoint).
- Must generate audible + visible alerts for new orders.

---

## 1) Login
**Inputs:** store selection (if multi-store), email, password  
**States:**
- Idle
- Logging in
- Error (invalid credentials / server down)

**Tracked events:**
- `ui_login_success`, `ui_login_failed`

---

## 2) Orders Board (Live)
### Layout
- Top bar: Store name + Mode pill (Open/Busy/Closed), Connection status, User menu
- Tabs or columns: New, Accepted, In Progress, Ready, Completed (optional)
- Each order card shows:
  - Order number
  - Customer name
  - Created time
  - Promised time
  - Item preview (first 1–2 items)
  - Total
  - Ack status (Seen/Unseen)

### States
- Empty state: “No new orders.”
- New order arrival:
  - sound + banner/toast
  - highlight until Acked or Accepted
- Disconnected:
  - persistent banner “Reconnecting…”
  - fallback polling every 5–10s
  - on reconnect: fetch missed events since last `event_id`

**Tracked events:**
- `ui_orders_board_loaded`
- `ui_ws_connected`, `ui_ws_disconnected`
- `ui_order_received` (client processed event)

---

## 3) Order Detail (Drawer/Modal)
### Content
- Header: Order #, status, timestamps
- Customer: name, phone (call button)
- Items list: qty, item name, modifiers snapshot, special instructions
- Internal notes (optional)
- Audit trail (order_events)

### Actions
- **Ack** (if unseen)
- **Accept**
- **Reject** (requires reason)
- Status transitions: In Progress, Ready, Completed
- Edit promised time (MANAGER+)

### States
- View
- Action in progress (optimistic UI)
- Conflict updated by another user (show “Updated by X at time” and refresh)

**Tracked events:**
- `ui_order_opened_detail`
- `ui_order_acked`
- `ui_order_status_changed`
- `ui_order_rejected`

---

## 4) Store Controls (MANAGER+)
- Set mode: Open / Busy / Closed
- Configure default prep time (optional MVP)
- Display current mode and last change

**States:**
- Viewing
- Saving
- Error

**Tracked events:**
- `ui_store_mode_changed`

---

## 5) Menu Availability (86 toggles) (MANAGER+)
- Search/filter items
- Toggle available/unavailable
- Optional note

**States:**
- Loading menu
- Updating availability
- Error

**Tracked events:**
- `ui_item_86_toggled`

---

## Tracked Event Dictionary (MVP)
### Staff UI
- `ui_login_success`
- `ui_ws_connected`, `ui_ws_disconnected`
- `ui_orders_board_loaded`
- `ui_order_received`
- `ui_order_acked`
- `ui_order_opened_detail`
- `ui_order_status_changed`
- `ui_order_rejected`
- `ui_store_mode_changed`
- `ui_item_86_toggled`

### Backend/Agent (for analytics)
- `call_started`, `call_ended`
- `call_transferred`
- `order_draft_created`, `order_created`
- `order_create_failed`
- `menu_unavailable_item_requested`
- `agent_low_confidence_escalation`
