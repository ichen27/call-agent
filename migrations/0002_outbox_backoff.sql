ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

UPDATE outbox_events
SET next_attempt_at = COALESCE(next_attempt_at, created_at, now());

ALTER TABLE outbox_events
  ALTER COLUMN next_attempt_at SET NOT NULL,
  ALTER COLUMN next_attempt_at SET DEFAULT now();
