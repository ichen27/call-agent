CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, email)
);

INSERT INTO staff_users (id, store_id, email, role, password_hash, is_active)
VALUES
  (
    'staff-1',
    'store-1',
    'staff@store.test',
    'STAFF',
    'pbkdf2_sha256$100000$staffsalt001$98a63c3ab1915f2b4a93348c96a1ce2bddd33acb758c7ea1a5a9f2112857751c',
    TRUE
  ),
  (
    'manager-1',
    'store-1',
    'manager@store.test',
    'MANAGER',
    'pbkdf2_sha256$100000$managersalt01$24df85cc71a92729aa1a940f129e91d5c8a4f11e8a5273b5c26e26ad308e9884',
    TRUE
  )
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  is_active = EXCLUDED.is_active;
