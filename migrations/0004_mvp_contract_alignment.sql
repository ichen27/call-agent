ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Downtown',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS public_phone TEXT NOT NULL DEFAULT '+15551231234';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promised_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS clarification_attempts INTEGER NOT NULL DEFAULT 0;

UPDATE stores
SET
  name = COALESCE(NULLIF(name, ''), 'Downtown'),
  timezone = COALESCE(NULLIF(timezone, ''), 'America/New_York'),
  public_phone = COALESCE(NULLIF(public_phone, ''), '+15551231234')
WHERE id = 'store-1';
