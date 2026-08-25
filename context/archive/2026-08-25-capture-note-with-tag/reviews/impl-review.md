<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Capture Note with Tag

- **Plan**: context/changes/capture-note-with-tag/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-25
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Tag find-or-create is not concurrency-safe; a race drops ALL tags for the note

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/notes.ts:93-99 (and the wrapping catch at :139)
- **Detail**: `findOrCreateTags` reads existing tags, then batch-inserts the missing ones with no upsert / `onConflict` / unique-violation handling. If two requests create the same tag name concurrently (e.g. a double-submit, or two tabs), the second `insert` violates the `tags(user_id, lower(name))` unique index and throws. That error propagates up to `createNoteWithTags`'s `catch` (:139), which discards the entire tag set and returns `tagsAttached: false` — so a single conflicting new tag drops *all* tags for that note, including ones that already resolved cleanly. This directly contradicts the plan's Key Discovery ("the service must find-or-create against `lower(name)` to avoid unique-violation errors", plan.md:25). MVP scale makes it unlikely but a double-click on Save is enough to trigger it.
- **Fix A ⭐ Recommended**: On the tag insert, catch the Postgres unique-violation (code `23505`), re-fetch the user's tags, and resolve the conflicting names against the now-existing rows instead of failing the whole batch.
  - Strength: Removes the unique-violation class the plan explicitly called out; keeps tags attached on the happy-ish path; matches the "find-or-create" intent.
  - Tradeoff: One extra round-trip only on the rare conflict path; a few lines of error-code handling.
  - Confidence: HIGH — the DB constraint and error code are known; re-fetch-and-resolve is deterministic.
  - Blind spot: Supabase surfaces the PG error code as `error.code`; verify the exact field name in this client version.
- **Fix B**: Accept as-is for MVP (single-user, low qps) and document the race as a known limitation / follow-up hardening candidate (the note is never lost regardless).
  - Strength: Zero code change; the durability guarantee (note survives) already holds.
  - Tradeoff: A double-submit silently loses tag attachment; contradicts a plan Key Discovery that will be inherited by S-02..S-05.
  - Confidence: MEDIUM — fine at true MVP scale, weak as a convention other slices copy.
  - Blind spot: Downstream slices may treat this service as the canonical tag-write path.
- **Decision**: ACCEPTED (Fix B) — accepted for MVP; queued as a hardening follow-up (see follow-ups/review-fixes.md). Note durability already holds regardless.

### F2 — Service exceptions escape API routes as non-JSON 500s, breaking the data-API contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/notes.ts:40,55 (and src/pages/api/tags.ts:27)
- **Detail**: The routes call `createNoteWithTags` / `listNotesWithTags` / `listTags` with no surrounding try/catch. Those service functions `throw` on any Supabase error (e.g. notes.ts:34, :49, :116). An unhandled throw yields Astro's default HTML 500 page, not the JSON `{ error }` envelope every other branch in these routes returns. Since this slice's explicit job is to "establish the project's data-API convention" (plan.md:7) that S-02..S-05 inherit, an inconsistent error shape here propagates.
- **Fix**: Wrap each handler's service call in try/catch and return `json({ error: "..." }, 500)` on failure (optionally log the underlying error server-side).
- **Decision**: FIXED + ACCEPTED-AS-RULE: API routes must return a JSON error envelope on every path, including 500s

### F3 — Swallowed error in the tag/link catch (no logging)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/notes.ts:139
- **Detail**: The `catch {}` block correctly preserves the note and returns `tagsAttached: false`, but discards the error entirely. When tags silently fail to attach, there is no server-side signal to diagnose whether it was the F1 race, an RLS/FK issue, or something else.
- **Fix**: `catch (e) { console.error("tag attach failed", e); ... }` before returning the partial-success result.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Don't swallow errors silently in a partial-success catch — log before degrading

### F4 — Partial-success surfaced via bespoke amber element instead of `ServerError` (plan drift)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/notes/NoteCapture.tsx:71-76
- **Detail**: The plan said to surface `tagsAttached: false` "via `ServerError` without discarding the saved note" (plan.md:192). The implementation instead renders a dedicated amber warning `<p>` (with a `CircleCheck` icon). Same intent, arguably better UX (a warning is not an error), so this is benign drift — but it introduces a one-off styled element rather than reusing the shared component, and pairs a check-circle icon with a warning message.
- **Fix**: Either accept the intentional warning-vs-error distinction (leave as-is), or extract a small shared `Notice`/`ServerWarning` component so downstream slices reuse it instead of re-inlining amber styling. If kept, consider a non-checkmark icon for the warning.
- **Decision**: FIXED — extracted `src/components/auth/ServerNotice.tsx` (sibling to `ServerError`, `TriangleAlert` icon); `NoteCapture` now renders `<ServerNotice message={warning} />` instead of the inline amber `<p>` + `CircleCheck`.

### F5 — `json()` response helper duplicated across API routes

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/notes.ts:8-13, src/pages/api/tags.ts:7-12
- **Detail**: The identical `json(body, status)` helper is copy-pasted in both new routes. As the data-API convention slice, this is the moment to hoist it (e.g. `src/lib/http.ts`) so S-02..S-05 don't re-copy it and drift.
- **Fix**: Extract a shared `json()` (and optionally error-envelope) helper under `src/lib/` and import it in both routes.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Hoist shared API helpers in the convention-setting slice, don't copy-paste. Extracted `src/lib/http.ts`; both routes now import `json` from `@/lib/http`.
