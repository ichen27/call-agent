# Agent Topology

This repository uses a core orchestrator plus specialists.

## Canonical policy location

Process gates, task modes, required evidence, and workflow lifecycle are defined in `AGENTS.md`.
Use this file for role definitions and routing only.

## Roles

- `orchestrator`: intake, risk classification, delegation, synthesis, and readiness checks
- `test-engineer`: test strategy and regression risk control for behavior changes

## Routing decision tree

1. Start with `orchestrator` for every non-trivial task.
2. Add `test-engineer` whenever runtime behavior changes, bug fixes are involved, or risk is not clearly low.
3. Use only `orchestrator` for docs-only tasks with no runtime behavior change.

## Notes for this repo

- Treat API contract compatibility (`docs/05_API_Spec.md`) as high-signal when routing risk.
- Treat order idempotency and telephony state-machine changes as at least `small-fix`, usually `feature` or `security-sensitive`.
