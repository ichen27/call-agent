# Codex Workflow Kit (Drop‑in, Modular)

This file is a **single, reusable “kit”** you can drop into *any* repository and give to Codex (or any coding agent) to:
- **replicate** the workflow + directory structure from this project
- stay **modular** (only keep the roles/templates you need)
- quickly **adapt to the target repo** (commands, docs map, stack, conventions)

> **How to use**
> 1) Put this file at repo root (recommended): `CODEX-WORKFLOW-KIT.md`
> 2) Tell the agent: “Follow `CODEX-WORKFLOW-KIT.md` → run BOOTSTRAP → produce diffs.”
> 3) The agent creates the file pack below (or updates existing files) and fills the placeholders.

---

## 0) BOOTSTRAP (Agent Instructions)

If you are an agent reading this, do **not** ask for permission—execute these steps and then show the diff:

1) **Scan the repo (fast, read-only):**
   - `README*`, `/docs*`, `CONTRIBUTING*`
   - build/test config (`package.json`, `pyproject.toml`, `go.mod`, etc.)
   - CI (`.github/workflows/*`, `buildkite`, etc.)
   - app code (`src/`, `app/`, `server/`, `cmd/`, `services/`, `tests/`)

2) **Detect the “Repo Truth”:**
   - Primary languages/frameworks
   - Canonical commands (install, lint, typecheck, tests, build, dev, ci)
   - Source-of-truth docs (or create a minimal `docs/` index)
   - Risk areas (auth, payments, PII, safety, infra, migrations)

3) **Choose modules (roles) to keep:**
   - Always keep: `orchestrator`
   - Usually keep: `test-engineer`
   - Add only if relevant:
     - `backend-api` (API contracts, validation, errors, sessions/state)
     - `ops-observability` (flags, logs/metrics/alerts, rollout/rollback)
     - `safety-moderation` (abuse controls, privileged actions, privacy)
     - `payments-ledger` (money/credits, idempotency, webhooks, invariants)
   - If your repo is frontend-heavy, swap in `frontend-ui` instead of `backend-api`.
   - If your repo is infra-heavy, add `infra-deploy`.

4) **Install the file pack** (tree below). If files already exist:
   - Preserve intent + structure
   - Update only what’s needed to align with this kit
   - Keep diffs small; don’t “reformat for fun”

5) **Fill placeholders** in `AGENTS.md` + role prompts:
   - Repo name, stack, command hooks, docs map, constraints, safety rules

6) **Output contract (always):**
   - Status (`blocked | in progress | ready for review`)
   - Files changed (repo-relative)
   - Commands run (never claim unrun commands)
   - Risks + mitigations
   - Rollback notes (if relevant)

---

## 1) Directory + File Structure (Replicable Scaffold)

Create (or align to) this structure:

```text
.
├─ AGENTS.md
├─ CHANGELOG.md
├─ DECISIONS.md
├─ SKILL.md
├─ agents/
│  ├─ README.md
│  ├─ HANDOFF-CONTRACT.md
│  ├─ orchestrator.md
│  ├─ backend-api.md              # optional module
│  ├─ safety-moderation.md        # optional module
│  ├─ payments-ledger.md          # optional module
│  ├─ test-engineer.md
│  └─ ops-observability.md        # optional module
├─ prompts/
│  ├─ task-brief-template.md
│  ├─ implementation-plan-template.md
│  ├─ risk-check-template.md
│  ├─ review-template.md
│  └─ pr-summary-template.md
└─ docs/                          # optional but recommended
   ├─ 00-README.md                # repo-specific doc index
   ├─ 01-PRD.md
   ├─ 02-User-Stories-MVP.md
   ├─ 03-System-Design.md
   ├─ 04-Data-Model.md
   ├─ 05-API-Spec.md
   ├─ 06-UX-UI-Spec.md
   ├─ 07-Test-Plan.md
   ├─ 08-Implementation-Plan.md
   ├─ 09-Observability-Plan.md
   ├─ 10-Security-Privacy-Checklist.md
   └─ 11-Launch-Rollback-Plan.md
```

If the repo already has docs (e.g., `/docs`, `/design`, `/adr`, `/spec`), keep them; just map them in `AGENTS.md`.

---

## 2) “Repo Truth” Slots (Fill These Once Per Repo)

Use this block to populate the **Repository Truth** section in `AGENTS.md`:

- **Repo name:** `<REPO_NAME>`
- **Repo type:** `<monorepo | service | library | frontend | infra | data>`
- **Languages:** `<TypeScript, Python, Go, ...>`
- **Frameworks/tools:** `<Next.js, FastAPI, Spring, ...>`
- **Testing:** `<Jest, Pytest, Go test, Playwright, ...>`
- **CI/CD:** `<GitHub Actions, Buildkite, ...>`
- **Environments:** `<local/dev/stage/prod>`
- **Constraints:** `<no new deps | strict PII rules | must preserve API contracts | ...>`

**Canonical commands** (fill with real ones from the repo):
- install: `<...>`
- lint: `<...>`
- typecheck/static: `<...>`
- test: `<...>`
- test:unit: `<...>` (optional)
- test:integration: `<...>` (optional)
- test:e2e: `<...>` (optional)
- build: `<...>` (optional)
- dev/local run: `<...>` (optional)
- ci: `<...>`

---

## 3) FILE PACK (Copy/Paste Templates)

Below are **ready-to-write file templates**. If you want this kit to *generate* files automatically, you can hand this file to the agent and say: “Create each file exactly as shown (then fill placeholders).”

### 3.1 `AGENTS.md` (Policy + Workflow)

> This is the “one file to rule them all”: gates, lifecycle, task modes, evidence requirements, and repo truth.

```md
# AGENTS.md — Codex Coding Agent Guide

Purpose: ship production-quality changes that are correct, secure, tested, maintainable, and reviewable.

## Mission & priorities

### Priorities (in order)
1. **Correctness & safety** (no regressions; handles edge cases)
2. **Security & privacy** (validation, authz, safe defaults, no leaks)
3. **Reliability** (clear errors, predictable failure modes)
4. **Maintainability** (small diffs, consistent patterns, readable code)
5. **Testability** (tests prove behavior)
6. **Performance** (avoid obvious inefficiencies; measure if uncertain)
7. **Operational clarity** (minimal, useful logs/metrics)

---

## Quick Start (Start Here)
1. Discover context in this order: `README.md` -> `docs/` (or your spec folder) -> build config -> CI -> nearby `src/` + `tests/`.
2. Classify task mode: `micro-fix | small-fix | feature | security-sensitive | cross-cutting | docs-only`.
3. Select required specialists using the Gate Matrix below.
4. Build task brief using `prompts/task-brief-template.md`.
5. Implement in small diffs; follow existing patterns.
6. Run required checks for task mode.
7. Report with evidence: files changed, commands run, risks, rollback notes.

---

## Workflow (step-by-step)
0. **Scope:** restate goal; list constraints; define acceptance criteria
1. **Understand:** trace current behavior; identify conventions
2. **Plan:** split into small commits (refactor -> change -> tests/docs)
3. **Implement:** follow patterns; validate boundaries; keep changes local
4. **Test:** add tests (happy/edge/failure/security); run checks
5. **Document/Ops:** update docs/config; minimal helpful telemetry
6. **Self-review:** remove dead code/debug; verify errors/logging; verify tests are meaningful

Chunking rules:
- Each commit builds and keeps tests passing
- Do not mix formatting/renames with logic unless necessary
- Prefer: add new path -> switch callers -> delete old path

---

## Definition of Ready (DoR)
Before implementation begins (beyond docs-only), ensure:
- Goal + acceptance criteria are explicit.
- Task mode selected.
- Routing is correct per `agents/README.md` (specialists engaged if needed).
- Stop-and-Ask gates checked (below).
- Test approach identified (what proves the change is correct).

## Definition of Done (DoD)
A change is Done when:
- Acceptance criteria are met and mapped to docs/specs when relevant.
- Required checks for the task mode have been run (**never claim unrun commands**).
- Tests cover: happy path + edge path + failure path (plus idempotency/race when relevant).
- Docs updated when behavior/ops/security changes (or state why not).
- Final output includes handoff sections (or PR summary) including risks + rollback notes.

### Threat Model Lite (required for `security-sensitive`)
Include in the task brief + final handoff:
1) Asset at risk (money, PII, staff controls, auth)
2) Attacker capability (anon/authed/staff/replay)
3) Abuse path (replay/escalation/injection)
4) Mitigation (RBAC, idempotency, rate limit, audit log, redaction)
5) Test evidence proving the mitigation

---

## Task Modes and Gate Matrix

| Task mode | Typical scope | Required specialists | Required checks | Required docs updates |
| --- | --- | --- | --- | --- |
| `micro-fix` | single-file/local tweak; no contracts/auth/payments/moderation/state changes | `orchestrator` (single-agent OK) | lint/static checks; targeted tests if behavior changes | `CHANGELOG.md` only if user-visible |
| `small-fix` | localized bug/validation fix | `orchestrator`, `test-engineer` (+ owner specialist if needed) | lint/static + targeted tests | `CHANGELOG.md` if behavior changed |
| `feature` | additive behavior in one subsystem | `orchestrator` + owner specialist + `test-engineer` | full CI (or stronger if risk warrants) | update impacted specs |
| `security-sensitive` | auth/authz, privacy, payments, moderation, staff controls, PII retention/deletion | `orchestrator`, `test-engineer` + relevant specialists | full CI + negative-path tests proving safeguards | update security/ops docs + `DECISIONS.md` |
| `cross-cutting` | multi-subsystem and/or code+ops+docs impact | `orchestrator`, `test-engineer`, `ops-observability` (+ domain specialists) | full CI + additional targeted tests | update all impacted docs + `CHANGELOG.md` |
| `docs-only` | no runtime behavior change | `orchestrator` (single-agent OK) | optional local validation | docs only |

### `micro-fix` boundaries (hard rules)
If any are true, escalate out of `micro-fix`:
- touches auth/authz, payments/ledger, moderation/safety, QA harness, PII retention/deletion
- changes public API behavior, error codes, or response shape
- changes multi-file flows or state transitions
- requires new dependencies or non-trivial CI/build changes

---

## Execution Playbooks (optional)
Add repo-specific playbooks here (payments, migrations, feature flags, etc.).

---

## Output Contract (Required)
For substantial tasks, output must include:
- Status (`blocked | in progress | ready for review`)
- Scope summary and assumptions
- Files changed (repo-relative)
- Behavioral changes
- Commands run with results (never claim unrun commands)
- Risks and mitigations
- Rollout/rollback notes when relevant

Use `agents/HANDOFF-CONTRACT.md` for specialist handoffs.

---

## Stop-and-Ask Hard Gates
Stop and ask before proceeding if:
- Requirements are ambiguous/contradictory
- Public API/contracts/backward compatibility may break
- Change touches auth/authz, payments, crypto, PII retention/deletion, or compliance
- Work requires new dependencies, major upgrades, or non-trivial CI/build changes
- Reliable test plan cannot be defined
- Prod risk is elevated (data loss, destructive ops, unsafe defaults)

When asking, include risk/ambiguity, 2–3 options, recommendation, and test/rollout plan.

---

## Repository Truth (Fill In / Keep Updated)

### Repository context
- Repo name: <REPO_NAME>
- Repo type: <...>
- Languages: <...>
- Frameworks/tools: <...>
- Testing tools: <...>
- CI/CD: <...>
- Target environments: <...>
- Coding standards: <...>
- Constraints: <...>

### Source-of-truth docs
- Product/scope: <path(s)>
- API contract: <path(s)>
- Data/state: <path(s)>
- Testing expectations: <path(s)>
- Observability: <path(s)>
- Security/privacy: <path(s)>
- Rollout/rollback: <path(s)>

### Canonical commands
- install: <...>
- lint/static: <...>
- typecheck/static: <...>
- test: <...>
- build: <...>
- dev/local run: <...>
- ci: <...>

---

## Engineering Standards (Reference)
- Treat external inputs as untrusted at every boundary.
- Deny-by-default for privileged operations.
- Never log secrets/tokens/raw PII; redact sensitive fields.
- Prefer small, composable functions and localized diffs.
- Tests must prove changed behavior (happy + edge + failure).
```

### 3.2 `agents/README.md` (Role routing only)

```md
# Agent Topology

This repository uses a core orchestrator plus specialists.

## Canonical Policy Location
Process gates, task-mode rules, required evidence, and the canonical workflow lifecycle are defined in `AGENTS.md`.
Use this file for role definitions and routing only.

## Roles (edit to match repo)
- `orchestrator`: intake, risk classification, delegation, synthesis, readiness.
- `backend-api`: endpoint behavior, validation/errors, API contract alignment.
- `safety-moderation`: abuse prevention, RBAC-sensitive ops, privacy-safe moderation.
- `payments-ledger`: idempotency, money/credits invariants, webhooks, payouts.
- `test-engineer`: test coverage strategy and regression risk control.
- `ops-observability`: logs/metrics/alerts, flags, launch/rollback notes.

## Routing Decision Tree
1. Start with `orchestrator` for every non-trivial task.
2. Add the owner specialist for the subsystem you’re changing.
3. Add `test-engineer` whenever behavior changes or bug fixes are involved.
4. Add `ops-observability` when changes affect flags, alerts, runbooks, auditability, or incident handling.

## Single-Agent Case
Use only `orchestrator` for docs-only tasks that do not change runtime behavior.
```

### 3.3 `agents/HANDOFF-CONTRACT.md` (Specialist output schema)

```md
# Handoff Contract v1

All specialist outputs must follow this schema.

## Required Sections
### Scope
- What was analyzed or changed.

### Assumptions
- Explicit assumptions. Use `None` if empty.

### Files Touched
- Repo-relative paths.
- Include line references when relevant.

### Behavioral Changes
- External behavior changes.
- Error/status code or contract changes.
- Data or state-transition changes.

### Risks
- Known failure modes and confidence level.
- Security/privacy risks and mitigations.

### Tests
- Added/updated tests.
- Commands run and outcomes.
- Explicitly state if tests were not run.

### Rollout / Rollback Notes
- Required flags/config changes.
- Safe rollback behavior.

### Observability Delta (required for `cross-cutting` and `security-sensitive`)
- Logs added/changed (fields + redaction notes).
- Metrics added/changed (names + intent).
- Alerts/runbooks impacted (what to update + where).

## Output Rules
- Findings first when performing review tasks.
- No ambiguous language for acceptance criteria.
- If blocked, identify the blocker and propose 2–3 options with a recommendation.
```

### 3.4 Role prompts (modules)

> Keep these short. Each specialist should cite their **source-of-truth files** (the real ones in the repo).

#### `agents/orchestrator.md`

```md
# Role: Orchestrator

## Mission
Deliver ship-safe velocity by turning ambiguous tasks into decision-complete implementation and review work.

## Responsibilities
1. Classify task and risk.
2. Select specialist set from `agents/README.md`.
3. Create concise task briefs using `prompts/task-brief-template.md`.
4. Synthesize specialist output and resolve conflicts.
5. Enforce quality/security/test gates from `AGENTS.md`.

## Required Checklist
- Requirements traced to source-of-truth docs.
- Public API behavior validated against contract docs (if applicable).
- Security/privacy constraints checked (if applicable).
- Test impact assessed against test plan.
- Rollout/rollback impact checked (if applicable).

## Output Contract
Produce final output with:
- summary,
- key changes,
- test evidence,
- residual risks,
- rollout/rollback note (if relevant).
```

#### `agents/test-engineer.md`

```md
# Role: Test Engineer

## Focus
Convert behavior changes into meaningful unit/integration/e2e coverage and regression checks.

## Guardrails
- Tests must prove changed behavior, edge cases, and failure paths.
- Prefer deterministic tests and explicit assertions.
- Do not claim test execution that did not happen.

## Deliverable
Return results using `agents/HANDOFF-CONTRACT.md`.
```

#### Optional modules (include only if relevant)


#### `agents/backend-api.md`
```md
# Role: Backend/API Specialist

## Focus
Endpoint contracts, validation, errors, idempotency, and session/state behavior.

## Source of Truth (fill with real files)
- Contract/spec: <path to API spec>
- Implementation: <paths to router/controllers/handlers>
- Shared helpers: <paths to http/validation/errors>

## Guardrails
- Preserve standardized error payload shape.
- Preserve explicit error codes (if the repo has them).
- Keep idempotent endpoints stable and deterministic.
- Preserve session/state-machine expectations.

## Required Checks
- Input validation at trust boundaries.
- Status code and body compatibility.
- Backward compatibility of existing routes.

## Deliverable
Return results using `agents/HANDOFF-CONTRACT.md`.
```

#### `agents/safety-moderation.md`
```md
# Role: Safety & Moderation Specialist

## Focus
Abuse prevention, policy-aligned moderation, RBAC-sensitive operations, and privacy-safe behavior.

## Source of Truth (fill with real files)
- Product/policy: <paths>
- Security/privacy checklist: <paths>
- Enforcement code: <paths>

## Guardrails
- Deny-by-default for privileged/staff actions.
- Never introduce logging of secrets/raw PII/raw content snapshots.
- Preserve auditability for sensitive actions.

## Required Checks
- RBAC correctness for privileged paths.
- Audit log coverage for sensitive actions.
- Enforcement safety + reversibility.
- Abuse-path tests exist and are meaningful.

## Deliverable
Return results using `agents/HANDOFF-CONTRACT.md`.
```

#### `agents/payments-ledger.md`
```md
# Role: Payments & Ledger Specialist

## Focus
Checkout/webhook correctness, idempotency, and balance/invariant safety.

## Source of Truth (fill with real files)
- Payment provider integration: <paths>
- Ledger/wallet/data model: <paths>
- Test plan: <paths>

## Guardrails
- Idempotency required for any “charge/send/payout” operations.
- Webhook processing must be signature-verified and deduplicated.
- Never allow negative balances (unless explicitly designed and tested).
- Preserve reconciliation / traceability.

## Required Checks
- Double-submit and duplicate event behavior.
- Invariant tests for balance transitions.
- Error behavior for insufficient funds and provider failures.

## Deliverable
Return results using `agents/HANDOFF-CONTRACT.md`.
```

#### `agents/ops-observability.md`
```md
# Role: Ops & Observability Specialist

## Focus
Operational safety, logs/metrics/alerts, and launch/rollback readiness.

## Source of Truth (fill with real files)
- Observability plan: <paths>
- Launch/rollback plan: <paths>
- Runbooks/oncall docs: <paths>

## Guardrails
- Structured logs with required IDs/context fields.
- Never log secrets/raw payment data/raw PII/raw sensitive payloads.
- Flagged rollouts should be reversible.

## Required Checks
- Metric impact for new/changed behavior.
- Alert/runbook impact for failure modes.
- Feature-flag and rollback implications.
- Auditability of operational toggles.

## Deliverable
Return results using `agents/HANDOFF-CONTRACT.md`.
```

---

### 3.5 Prompt templates (`prompts/`)

#### `prompts/task-brief-template.md`
```md
# Task Brief Template

## Goal
-

## Non-Goals
-

## Task Mode
- `small-fix | feature | security-sensitive | cross-cutting | docs-only`

## Gate Level
- `light | standard | strict`

## Risk Level
- `low | medium | high`

## Constraints
- Security/privacy:
- Backward compatibility:
- Performance:
- Dependency constraints:

## Relevant Docs
-

## Acceptance Criteria
1.
2.
3.

## Required Specialists
-

## Required Evidence
- Commands/tests that must be run:
- Risks that must be evaluated:
- Rollback details required?:
```

#### `prompts/implementation-plan-template.md`
```md
# Implementation Plan Template

## Scope Summary
-

## Proposed Changes
1.
2.
3.

## API/Contract Impact
-

## Data/State Impact
-

## Docs Impacted
-

## Observability Impact
- Logs:
- Metrics/alerts:

## Risks and Mitigations
-

## Test Plan
- Unit:
- Integration:
- E2E/manual:

## Rollout / Rollback Impact
- Flags/config:
- Rollout steps:
- Rollback steps:
```

#### `prompts/risk-check-template.md`
```md
# Risk Check Template

## Change Summary
-

## Potential Risks
1.
2.

## Security/Privacy Impact
- Data touched:
- Auth/RBAC impact:
- Logging/redaction impact:

## Operational Impact
- Flags/config:
- Alerting changes:
- Rollback behavior:

## Recommendation
-
```

#### `prompts/review-template.md`
```md
# Review Template (Findings First)

## Findings
1. Severity: `high | medium | low`
   - File:
   - Impact:
   - Why it matters:
   - Recommended fix:
   - Test gap:

## Contract and Risk Assessment
- API/contract impact:
- Security/privacy impact:
- Rollback risk:

## Open Questions / Assumptions
-

## Change Summary
-

## Commands Run
-
```

#### `prompts/pr-summary-template.md`
```md
# PR Summary Template

## Summary
-

## Context
- Issue:
- Current vs desired behavior:

## Changes
-

## Testing
- Commands run:
  - `<lint command>`
  - `<typecheck/static command>`
  - `<unit tests>`
  - `<integration tests>`

## Rollout / Ops
- Flags/config:
- Migration:
- Monitoring:
- Rollback:

## Security / Privacy
- Data touched:
- Authz:
- Redaction/logging:
```

### 3.6 `SKILL.md`, `CHANGELOG.md`, `DECISIONS.md` (recommended)

#### `SKILL.md` (when to use “skills” / external automation)
```md
# Skill Usage in This Repo

Use local skills only when task intent matches their trigger conditions.

## Rules
1. Do not invoke skills for normal feature/bug/test work unless explicitly needed.
2. Use a “skill creator” only when the request is to design or revise a reusable skill package.
3. Use a “skill installer” only when the request is to discover/install skills.
4. If a skill is not needed, continue with the standard `AGENTS.md` + `agents/` workflow.
```

#### `CHANGELOG.md` (small + readable)
```md
# Changelog

## Unreleased

### Added
-

### Changed
-

### Fixed
-

### Security
-
```

#### `DECISIONS.md` (mini ADR log)
```md
# Decisions

## YYYY-MM-DD - <short decision title> (ADR-000X)
- Status: proposed | accepted | deprecated
- Context:
- Decision:
- Rationale:
- Consequences:
- Rollback:
```

---

## 4) Changelog + Decisions (Lightweight Governance)

### `CHANGELOG.md` (keep short)
- Track **user-visible behavior** changes and workflow/tooling changes.

### `DECISIONS.md` (ADRs)
- Record “why” for non-obvious choices: dependency adds, contract changes, security posture, major refactors.

---

## 5) Make It Modular (Prune for Your Repo)

You can safely delete modules you don’t need, **as long as `AGENTS.md` + `agents/README.md` stays consistent**.

Common minimal sets:
- **Docs-only repo:** `orchestrator` only
- **Small library:** `orchestrator` + `test-engineer`
- **Backend service:** + `backend-api` + `ops-observability`
- **Payments product:** + `payments-ledger`
- **Safety/moderation product:** + `safety-moderation`

---

## 6) What the agent should do on every task (tiny checklist)

- Read: `AGENTS.md` → relevant docs/specs → nearest code/tests.
- Decide task mode + specialists.
- Write a task brief (template).
- Implement small diffs.
- Run required commands.
- Report evidence + risks + rollback.

