# Handoff Contract v1

All specialist outputs must follow this schema.

## Required sections

### Scope

- What was analyzed or changed.

### Assumptions

- Explicit assumptions. Use `None` if empty.

### Files touched

- Repo-relative paths.
- Include line references when relevant.

### Behavioral changes

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

### Rollout / rollback notes

- Required flags/config changes.
- Safe rollback behavior.

## Output rules

- Findings first for review tasks.
- No ambiguous acceptance criteria.
- If blocked, identify blocker and provide 2-3 options with recommendation.
