# Auth Operations Runbook (MVP)

## Scope
- Staff/manager credential bootstrap and rotation
- JWT/service-token secret handling
- Safe rollback steps for auth incidents

## Environment secrets
- `JWT_SECRET`: required in non-local environments
- `INTERNAL_API_KEY`: protects `/api/internal/outbox*` when set
- `TELEPHONY_WEBHOOK_TOKEN`: protects `/api/telephony/*` when set

Store all secrets in your secret manager, never in repo or `.env` committed files.

## Staff user bootstrap (Postgres mode)
1. Generate PBKDF2 password hashes (format: `pbkdf2_sha256$iterations$salt$digest`).
2. Insert/update rows in `staff_users` with `is_active=true`.
3. Validate login via `POST /api/auth/login`.

Hash generation example:

```bash
node -e 'const crypto=require("crypto"); const p=process.argv[1]; const s=crypto.randomBytes(12).toString("hex"); const i=100000; const d=crypto.pbkdf2Sync(p,s,i,32,"sha256").toString("hex"); console.log(`pbkdf2_sha256$${i}$${s}$${d}`);' "REPLACE_WITH_PASSWORD"
```

## Rotate staff passwords
1. Generate new hash.
2. Update `staff_users.password_hash` for the target user.
3. Confirm old password fails and new password succeeds.
4. Record rotation in operations log.

Suggested SQL:

```sql
UPDATE staff_users
SET password_hash = '<new_hash>'
WHERE store_id = '<store-id>' AND email = '<user-email>';
```

## Rotate JWT/service tokens
1. Create new `JWT_SECRET`, `INTERNAL_API_KEY`, `TELEPHONY_WEBHOOK_TOKEN`.
2. Deploy updated secrets to staging and verify:
   - `/api/auth/login` issues/validates JWTs
   - Internal outbox calls include `x-internal-api-key`
   - Telephony webhooks include `x-telephony-token`
3. Roll to production with monitored canary.
4. Invalidate old secrets after cutover window.

## Incident fallback
- If auth causes outage:
  - Temporarily set `AUTH_REQUIRED=false` for protected staff routes (short-lived emergency only).
  - Keep service-token protections enabled for telephony/internal endpoints.
  - Restore normal auth requirements after fix and re-enable strict checks.

## Verification checklist
- [ ] `AUTH_REQUIRED=true` in non-local environments
- [ ] `JWT_SECRET` set and rotated periodically
- [ ] `staff_users` contains only active intended users
- [ ] `INTERNAL_API_KEY` set for production
- [ ] `TELEPHONY_WEBHOOK_TOKEN` set for production
