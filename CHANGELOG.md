# Changelog

## Unreleased

### Added

- Core MVP backend service with Express routes for health, menu, store mode, orders, order events, and telephony webhooks.
- Deterministic voice order state machine with controlled tool execution (`get_store_mode`, `validate_item`, `create_order`, `handoff`).
- In-memory domain store for menu, store mode, call sessions, orders, idempotency keys, and append-only order events.
- Initial test coverage for order idempotency/status transitions and telephony confirmation duplicate protection.
- Agent workflow scaffolding: `agents/` role routing + handoff contract.
- Prompt templates under `prompts/` for task briefs, implementation plans, risk checks, reviews, and PR summaries.

### Changed

- `AGENTS.md` now reflects repository truth, command hooks, task modes, and stop-and-ask gates for this codebase.

### Fixed

-

### Security

- Added explicit workflow guardrails for sensitive logging, API contract risk, idempotency, and telephony state-machine safety.
