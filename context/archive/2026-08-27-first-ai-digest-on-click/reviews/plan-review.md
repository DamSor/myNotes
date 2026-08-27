<!-- PLAN-REVIEW-REPORT -->
# Plan Review: First AI Digest on Click

- **Plan**: context/changes/first-ai-digest-on-click/plan.md
- **Mode**: Deep
- **Date**: 2026-08-27
- **Verdict**: REVISE → SOUND (after fixes)
- **Findings**: [1 critical] [1 warning] [1 observation]

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | FAIL → PASS (after fixes) |

## Grounding

7/7 paths ✓, 6/6 symbols ✓, brief↔plan ✓

## Findings

### F1 — Nav link target (Topbar.astro) not rendered on authenticated pages

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3, Change 5 — Navigation link
- **Detail**: Topbar.astro is only imported by Welcome.astro (landing page). Authenticated pages (/notes, /dashboard) use Layout.astro directly with no navigation. A link added to Topbar.astro would be invisible from the main app.
- **Fix**: Specify inline nav row on each authenticated Astro page (notes.astro, dashboard.astro, ai.astro) with cross-links and current-page highlighting.
- **Decision**: FIXED — updated Phase 3 Change 5 to specify nav on all three authenticated pages.

### F2 — Prompt-size truncation in scope but absent from Phase 2 service contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, Change 1 — Digest service contract
- **Detail**: Plan-brief scope lists "Prompt-size safeguard (truncate if notes exceed ~50k chars)" as in-scope. Performance Considerations says to include it in the service. But the generateDigest contract had no truncation step — an implementer following the contract would skip it.
- **Fix**: Added truncation bullet to the generateDigest contract specifying 50k char limit with oldest-first truncation and system note.
- **Decision**: FIXED — added to Phase 2 service contract.

### F3 — "Since last digest" window ignores updated notes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, Change 1 — note selection window
- **Detail**: The service fetches "notes since the last digest" without specifying which timestamp column. Using created_at means edited notes are not re-digested.
- **Fix**: Added clarifying sentence to generateDigest contract explicitly stating created_at window and that edited notes not being re-digested is acceptable for MVP.
- **Decision**: FIXED — clarification added to contract.
