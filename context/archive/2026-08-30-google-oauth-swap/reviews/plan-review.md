<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Google OAuth Swap

- **Plan**: context/changes/google-oauth-swap/plan.md
- **Mode**: Deep
- **Date**: 2026-08-30
- **Verdict**: REVISE → SOUND (after fixes)
- **Findings**: [1 critical] [1 warning] [1 observation]

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

Grounding: 16/16 paths ✓, 6/6 symbols ✓, brief↔plan ✓

## Findings

### F1 — Deleting ServerError.tsx and SubmitButton.tsx breaks the build

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Delete Password Auth Components
- **Detail**: Phase 2.1 deletes ServerError.tsx and SubmitButton.tsx as "password-form-only" components, but both are imported by non-auth files that survive the cleanup: ServerError by NoteItem.tsx, NoteCapture.tsx, DigestItem.tsx; SubmitButton by NoteCapture.tsx. The plan's own grep verification (step 2.3) would catch dangling imports — but only after the files are already deleted.
- **Fix A ⭐ Recommended**: Keep ServerError.tsx and SubmitButton.tsx alongside ServerNotice.tsx
  - Strength: Zero-effort fix; these are generic UI primitives, not password-specific.
  - Tradeoff: auth/ directory retains 3 files instead of 1.
  - Confidence: HIGH — verified via grep; all importers confirmed.
  - Blind spot: None significant.
- **Fix B**: Move ServerError.tsx and SubmitButton.tsx out of auth/ into a shared location
  - Strength: Clarifies they're app-wide UI primitives.
  - Tradeoff: Widens Phase 2 scope with import rewrites in 4 files.
  - Confidence: MEDIUM — clean but adds scope.
  - Blind spot: FormField.tsx keep/delete decision.
- **Decision**: FIXED (Fix A) — kept both files in auth/, updated deletion list from 6 to 4 files, corrected grep verification and directory check.

### F2 — Progress section has missing items and Phase 0 name mismatch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: ## Progress (bottom of plan)
- **Detail**: Multiple success criteria bullets had no matching Progress entries: Phase 0 name omitted "(Manual Prerequisite)", Phase 1 Automated missing "No TypeScript errors referencing deleted imports", Phase 1 Manual consolidated 9 criteria into 6 items losing coverage, Phase 2 Manual missing directory-contents check.
- **Fix**: Add missing progress items and align Phase 0 heading.
- **Decision**: FIXED — added Phase 1 items 1.3, 1.6, 1.7, 1.8, 1.9; renumbered existing manual items; added Phase 2 item 2.6; aligned Phase 0 heading.

### F3 — ServerNotice importer list is incorrect

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State — Key Discoveries, bullet 3
- **Detail**: Plan stated "ServerNotice.tsx is used by NoteCapture.tsx, NoteItem.tsx, DigestItem.tsx" — DigestItem.tsx actually imports ServerError, not ServerNotice. This name-swap was the root cause of F1.
- **Fix**: Correct the importer list (superseded by F1's fix).
- **Decision**: DISMISSED — already resolved by F1 fix.
