# API Spec (MVP)

## Conventions
- Base: `/api`
- Staff auth: JWT Bearer
- Service auth: Voice Service uses service token or internal network policy
- Idempotency: `Idempotency-Key` header on `POST /orders`
- Errors: `{ "error": { "code": "...", "message": "...", "details": ... } }`
- Runtime auth mode:
  - If `AUTH_REQUIRED` is set, it is the source of truth.
  - If `AUTH_REQUIRED` is unset:
    - `NODE_ENV=development|test`: missing bearer token allowed on protected routes.
    - Other environments: protected routes enforce bearer token + role by default.
- Token scope:
  - If bearer auth is present, store-bound endpoints enforce token `store_id` scope and return `403` on mismatch.
- Optional service-token enforcement:
  - Set `INTERNAL_API_KEY` to require `x-internal-api-key` on `/api/internal/outbox*`.
  - Set `TELEPHONY_WEBHOOK_TOKEN` to require `x-telephony-token` on `/api/telephony/*`.

### GET `/health`
**Response**
```json
{ "ok": true, "service": "call-agent", "backend": "memory" }
```

---

## Auth

### POST `/api/auth/login`
Notes:
- Credentials are validated against persistent staff user records (`staff_users` in postgres mode).

**Request**
```json
{ "store_id": "uuid", "email": "user@restaurant.com", "password": "..." }
```

**Response**
```json
{
  "token": "jwt...",
  "user": { "id":"uuid", "role":"MANAGER", "store_id":"uuid", "email":"user@restaurant.com" }
}
```

### GET `/api/auth/me`
**Response**
```json
{ "id":"uuid", "role":"STAFF", "store_id":"uuid", "email":"..." }
```

---

## Stores

### GET `/api/stores/{store_id}`
**Response**
```json
{
  "id":"uuid",
  "name":"Downtown",
  "timezone":"America/New_York",
  "public_phone":"+15551231234",
  "mode":"OPEN",
  "default_prep_mins": 20
}
```

### PATCH `/api/stores/{store_id}/mode` (MANAGER+)
**Request**
```json
{ "mode": "BUSY", "reason": "Rush hour" }
```

**Response**
```json
{ "mode": "BUSY" }
```

---

## Menu

### GET `/api/stores/{store_id}/menu`
**Response (example minimal)**
```json
{
  "items": [
    {
      "id":"uuid",
      "name":"Chicken Burrito",
      "base_price_cents": 1299,
      "is_available": true,
      "modifier_groups":[
        {
          "id":"uuid",
          "name":"Salsa",
          "required": true,
          "min_select": 1,
          "max_select": 1,
          "modifiers":[
            {"id":"uuid","name":"Mild","price_delta_cents":0},
            {"id":"uuid","name":"Hot","price_delta_cents":0}
          ]
        }
      ]
    }
  ]
}
```

### PATCH `/api/menu/items/{item_id}/availability` (MANAGER+)
**Request**
```json
{ "is_available": false, "note": "Sold out" }
```

**Response**
```json
{ "id":"uuid", "is_available": false }
```

---

## Orders

### POST `/api/orders` (Voice Service)
Headers:
- `Idempotency-Key: <string>`

**Request**
```json
{
  "store_id": "uuid",
  "source": "PHONE",
  "customer_name": "Ivan",
  "customer_phone": "+15550001111",
  "order_type": "PICKUP",
  "notes": "No onions",
  "items": [
    {
      "item_id": "uuid",
      "item_name_snapshot": "Chicken Burrito",
      "qty": 2,
      "base_price_cents": 1299,
      "modifiers_snapshot_json": [
        {"group":"Salsa","modifier":"Hot","price_delta_cents":0}
      ],
      "special_instructions": "extra napkins",
      "line_total_cents": 2598
    }
  ],
  "subtotal_cents": 2598,
  "tax_cents": 0,
  "fees_cents": 0,
  "total_cents": 2598,
  "promised_time": "2026-02-21T19:20:00-05:00",
  "call_id": "CAxxxx"
}
```

**Response (201)**
```json
{
  "id": "uuid",
  "order_number": 1042,
  "status": "NEW",
  "created_at": "2026-02-21T19:02:10-05:00"
}
```

### GET `/api/orders?store_id=...&status=NEW,ACCEPTED&limit=50`
**Response**
```json
{
  "orders": [
    {
      "id":"uuid",
      "order_number":1042,
      "status":"NEW",
      "customer_name":"Ivan",
      "customer_phone":"+15550001111",
      "promised_time":"2026-02-21T19:20:00-05:00",
      "total_cents":2598,
      "created_at":"2026-02-21T19:02:10-05:00"
    }
  ],
  "next_cursor": null
}
```

### GET `/api/orders/{order_id}`
Returns full order + items + events.

**Response**
```json
{
  "order": {
    "id":"uuid",
    "order_number":1042,
    "status":"NEW"
  },
  "events": [
    {
      "id": 12346,
      "event_type": "OrderCreated",
      "payload": { "order_id":"uuid" },
      "created_at":"2026-02-21T19:02:10-05:00"
    }
  ]
}
```

### PATCH `/api/orders/{order_id}` (STAFF+)
**Request**
```json
{
  "status": "ACCEPTED",
  "promised_time": "2026-02-21T19:30:00-05:00",
  "note": "Extended due to rush"
}
```

**Response**
```json
{ "id":"uuid", "status":"ACCEPTED" }
```

### POST `/api/orders/{order_id}/ack` (STAFF+)
**Request**
```json
{ "client_id": "tablet-front-1" }
```

**Response**
```json
{ "acked": true }
```

---

## Events / Catch-up

### GET `/api/stores/{store_id}/events?since_id=12345&limit=500`
**Response**
```json
{
  "events": [
    {
      "id": 12346,
      "event_type": "OrderCreated",
      "payload": { "order_id":"uuid", "order_number":1042, "status":"NEW" },
      "created_at":"2026-02-21T19:02:10-05:00"
    }
  ],
  "next_since_id": 12346
}
```

---

## Internal operations (MVP debug surface)

### GET `/api/internal/outbox?store_id=...&status=PENDING|SENT|FAILED|DEAD_LETTER`
Returns outbox rows for inspection in local/dev environments.

### POST `/api/internal/outbox/publish`
Marks pending outbox rows as sent.

**Request**
```json
{ "store_id":"uuid", "limit": 100 }
```

### WebSocket `wss://<host>/ws?store_id=...`
Client subscribe:
```json
{ "type":"subscribe", "store_id":"uuid", "since_event_id":12345 }
```

Server push:
```json
{
  "type":"OrderCreated",
  "event_id":12346,
  "store_id":"uuid",
  "payload": { "order_id":"uuid", "order_number":1042, "status":"NEW" }
}
```

Client ACK:
```json
{ "type":"ack", "event_id":12346 }
```

---

## Telephony (provider-facing, conceptual)
- `POST /api/telephony/inbound` — start session and return call control instructions
- `POST /api/telephony/status` — call ended updates
- Media stream WebSocket between provider and Voice Service
