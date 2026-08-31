<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Google OAuth Swap

- **Plan**: context/changes/google-oauth-swap/plan.md
- **Scope**: Full plan — Phase 0, 1, 2 of 3
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Hash-fragment bridge logic duplicated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/auth/callback.ts:8-30, src/pages/auth/signin.astro:51-64
- **Detail**: Both files contain near-identical inline `<script>` blocks that parse `location.hash` for `error` / `error_description` and redirect to `/auth/signin?error=...`. The callback route renders the bridge as a full HTML page when `code` is missing; the signin page runs it as an `is:inline` script. Per lessons.md ("Hoist shared API helpers — don't copy-paste"), this duplication invites drift if one copy is updated without the other.
- **Fix**: Add a cross-referencing code comment in each file noting the other location, or extract a shared `public/scripts/oauth-hash-bridge.js` and reference it from both. Given the scripts are small and inline, a cross-reference comment is the pragmatic choice.
- **Decision**: FIXED — added cross-reference comments in both callback.ts and signin.astro

### F2 — signout.ts inconsistent with new auth route patterns (pre-existing)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signout.ts
- **Detail**: The new `signin.ts` and `callback.ts` both export `const prerender = false` and wrap Supabase calls in try/catch with `console.error`. The pre-existing `signout.ts` has neither — it omits `prerender = false` and lets `signOut()` exceptions escape as Astro's default HTML 500 page. While this file was not modified by this change, the auth API surface now has an internal inconsistency: 2 of 3 auth routes follow the pattern, 1 does not.
- **Fix**: Add `export const prerender = false;` after imports, wrap the `signOut()` call in try/catch with `console.error`, and redirect to `/` regardless (sign-out is best-effort).
- **Decision**: FIXED — added prerender = false and try/catch with console.error

### F3 — Root route implemented as `.ts` API route instead of modifying `.astro`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/index.ts (new), src/pages/index.astro (deleted)
- **Detail**: The plan specified modifying `index.astro`'s frontmatter to add redirect logic with no HTML body. Instead, `index.astro` was deleted and replaced with `index.ts` — a TypeScript API route exporting a `GET` handler with the same auth-aware redirect logic. Functionally identical, and arguably a better fit since no HTML template is needed for a pure redirect.
- **Fix**: No action needed. Document the deviation in the plan as an addendum if desired.
- **Decision**: ACCEPTED — .ts API route is a better fit for a pure redirect

### F4 — Unplanned `oauth-error.ts` utility

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/oauth-error.ts (new, 12 lines)
- **Detail**: A new `oauthUserMessage(code, description)` helper was created to map OAuth error codes/descriptions to user-facing strings. It is imported by both `callback.ts` and `signin.astro`. This file was not mentioned in the plan but follows the project lesson "Hoist shared API helpers — don't copy-paste" — a positive deviation that avoids duplicating error-mapping logic.
- **Fix**: No action needed. This is a beneficial addition.
- **Decision**: ACCEPTED — positive deviation following the "hoist shared helpers" lesson
