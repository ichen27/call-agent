CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'OPEN',
  default_prep_mins INTEGER NOT NULL DEFAULT 20
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number BIGSERIAL UNIQUE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  notes TEXT,
  call_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_name_snapshot TEXT NOT NULL,
  qty INTEGER NOT NULL,
  base_price_cents INTEGER NOT NULL,
  modifiers_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  special_instructions TEXT,
  line_total_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  store_id TEXT NOT NULL,
  key TEXT NOT NULL,
  order_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, key)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS call_sessions (
  call_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  state TEXT NOT NULL,
  caller_phone TEXT NOT NULL,
  customer_name TEXT,
  draft_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_clarification_json JSONB,
  created_order_id TEXT,
  handoff BOOLEAN NOT NULL DEFAULT FALSE,
  ended_at TIMESTAMPTZ
);

INSERT INTO stores (id, mode, default_prep_mins)
VALUES ('store-1', 'OPEN', 20)
ON CONFLICT (id) DO NOTHING;

INSERT INTO menu_items (id, store_id, name, base_price_cents, is_available)
VALUES
  ('item-burrito', 'store-1', 'Chicken Burrito', 1299, TRUE),
  ('item-bowl', 'store-1', 'Veggie Bowl', 1199, TRUE)
ON CONFLICT (id) DO NOTHING;
