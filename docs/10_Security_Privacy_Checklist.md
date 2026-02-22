# Security & Privacy Checklist (MVP)

## Authentication & Authorization
- [ ] JWT auth for staff UI
- [ ] Strong password hashing (bcrypt/argon2)
- [ ] RBAC enforced on all endpoints
- [ ] Service-to-service auth for Voice → Order Service (service token and/or mTLS)

## Data Protection
- [ ] TLS everywhere (HTTPS/WSS)
- [ ] Secrets in secret manager (not repo/env leaks)
- [ ] PII minimized (name + phone only for MVP)
- [ ] Transcript retention policy (e.g., 30 days) + access restricted to managers
- [ ] Audit log for:
  - order changes
  - store mode changes
  - 86 toggles
  - user logins (optional)

## Webhook & Abuse Prevention
- [ ] Verify telephony provider webhook signatures
- [ ] Rate limit public endpoints
- [ ] Input validation (schema-based)
- [ ] Basic WAF / IP allowlist if feasible

## Privacy & Legal
- [ ] Call recording OFF by default
- [ ] If enabled: audible notice + configurable retention + access controls
- [ ] Document data deletion/export procedure for store owner requests
