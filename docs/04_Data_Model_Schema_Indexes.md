# Data Model (Schema + Indexes) — Postgres (MVP)

## Notes
- UUID primary keys for most tables.
- `orders.order_number` is human-friendly; can be global sequence (MVP) or per-store (later).
- Store immutable snapshots for menu names/modifiers on each `order_items` row.

## Schema (DDL)
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE stores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'America/New_York',
  public_phone      TEXT NOT NULL,
  mode              TEXT NOT NULL DEFAULT 'OPEN',
  default_prep_mins INTEGER NOT NULL DEFAULT 20,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email         CITEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'STAFF',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  base_price_cents  INTEGER NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modifier_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  required    BOOLEAN NOT NULL DEFAULT FALSE,
  min_select  INTEGER NOT NULL DEFAULT 0,
  max_select  INTEGER NOT NULL DEFAULT 1,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE modifiers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE item_modifier_groups (
  item_id  UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, group_id)
);

CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source         TEXT NOT NULL DEFAULT 'PHONE',
  status         TEXT NOT NULL DEFAULT 'NEW',
  order_number   BIGSERIAL,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  order_type     TEXT NOT NULL DEFAULT 'PICKUP',
  notes          TEXT,
  promised_time  TIMESTAMPTZ,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents      INTEGER NOT NULL DEFAULT 0,
  fees_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL DEFAULT 0,
  call_id        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id                UUID REFERENCES menu_items(id),
  item_name_snapshot     TEXT NOT NULL,
  qty                    INTEGER NOT NULL CHECK (qty > 0),
  base_price_cents       INTEGER NOT NULL DEFAULT 0,
  modifiers_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  special_instructions   TEXT,
  line_total_cents       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE order_events (
  id           BIGSERIAL PRIMARY KEY,
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  actor_type   TEXT NOT NULL, -- AGENT | STAFF | SYSTEM
  actor_id     UUID,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, key)
);

CREATE TABLE outbox_events (
  id              BIGSERIAL PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  aggregate_type  TEXT NOT NULL DEFAULT 'ORDER',
  aggregate_id    UUID NOT NULL,
  event_type      TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE TABLE call_sessions (
  call_id           TEXT PRIMARY KEY,
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  outcome           TEXT,
  transcript_json   JSONB,
  created_order_id  UUID REFERENCES orders(id)
);
```

## Indexes
```sql
CREATE UNIQUE INDEX idx_staff_users_store_email ON staff_users(store_id, email);

CREATE INDEX idx_orders_store_status_created ON orders(store_id, status, created_at DESC);
CREATE INDEX idx_orders_store_created ON orders(store_id, created_at DESC);
CREATE UNIQUE INDEX idx_orders_call_id ON orders(call_id) WHERE call_id IS NOT NULL;

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE INDEX idx_order_events_order_id_id ON order_events(order_id, id DESC);
CREATE INDEX idx_order_events_created_at ON order_events(created_at DESC);

CREATE INDEX idx_outbox_pending ON outbox_events(status, next_attempt_at, id);

CREATE INDEX idx_menu_items_store_available ON menu_items(store_id, active, is_available);
```
