<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First AI Digest on Click

- **Plan**: context/changes/first-ai-digest-on-click/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-08-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — "Since last digest" watermark drops notes written during generation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/digest.ts:126-159
- **Detail**: The next digest's window is derived from the previous digest row's own `created_at` (`since = lastDigest.created_at`, line 127). That timestamp is set at INSERT (line 144-153) — *after* notes are fetched (line 129) and *after* the LLM call, which can take up to the 25s `chatCompletion` timeout. Any note a user writes in that fetch→LLM→insert window gets a `created_at` earlier than the digest's `created_at`, so it is never included in this digest and is permanently excluded from every future one (`created_at > since` skips it). This is silent, permanent data loss from digests — worse than the already-accepted "edited notes aren't re-digested" limitation the plan documents.
- **Fix A ⭐ Recommended**: Watermark on the newest *included note's* `created_at` instead of the digest row's. Add a `covered_until timestamptz` column to `ai_content` (set to `max(kept.created_at)` at insert) and window on `notes.created_at > last_digest.covered_until`.
  - Strength: Closes the loss window entirely; the watermark reflects actual coverage, not wall-clock insert time.
  - Tradeoff: Requires an additive migration + a couple of service-line changes.
  - Confidence: HIGH — the fetched set already carries the exact `created_at` values needed.
  - Blind spot: Notes sharing the identical `created_at` of the boundary note (same-microsecond) would still be skipped by `>`; negligible in practice.
- **Fix B**: Accept as a documented MVP limitation — add a code comment + a follow-up note, mirroring the existing "edited notes not re-digested" carve-out.
  - Strength: Zero code/migration risk now; consistent with the plan's stated MVP windowing simplification.
  - Tradeoff: Ships a real (if narrow) data-loss path; users can't recover the dropped notes into a later digest.
  - Confidence: MEDIUM — depends on how often users write during a generation.
  - Blind spot: Not yet measured how long real LLM calls take (widens or narrows the window).
- **Decision**: FIXED via Fix B — accepted as MVP limitation; comment added in digest.ts, follow-up queued in follow-ups/review-fixes.md.

### F2 — Unbounded note fetch risks the 10ms CPU cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/lib/services/digest.ts:65-88 (`fetchNotesSinceForTag`)
- **Detail**: The query has no `.limit()`. On a heavily-used tag's *first* digest (`since === null`), it pulls every note for that tag, and `truncateNotes` (line 101) then iterates and sums `content.length` over the whole set before the char cap even applies. Cloudflare Workers Free tier enforces a 10ms CPU cap; a large result set could blow it and fail the request before the LLM is ever called.
- **Fix**: Add a bounded cap to the query — e.g. order by `created_at desc`, `.limit(200)`, then reverse to chronological — so the row count is bounded regardless of tag size. The 50k-char `truncateNotes` safeguard then trims further.
  - Strength: Bounds both DB payload and in-Worker iteration in one change; complements the existing char-limit safeguard.
  - Tradeoff: A "first digest" on a huge tag would cover only the most recent N notes (reasonable for a digest).
  - Confidence: MEDIUM — exact safe N depends on note sizes, but any finite cap removes the unbounded risk.
  - Blind spot: Haven't profiled real CPU cost per note count on Free tier.
- **Decision**: FIXED — added NOTE_FETCH_LIMIT (200), query now orders desc + limit, returns reversed to chronological.

### F3 — Planned skeleton loading variant not implemented

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/ai/DigestList.tsx
- **Detail**: The plan (Phase 3, item 4) specifies "Skeleton variant for loading." `DigestList` renders the SSR-hydrated list and empty state but has no skeleton. In practice this is near-dead code: the component only receives `initialDigests` from server render and never fetches client-side, so there is no loading state to skeleton. The drift is real but benign.
- **Fix**: Drop the skeleton requirement from the plan as an addendum (the SSR-only design makes it unnecessary), or add a minimal skeleton only if client-side refetch is introduced later.
- **Decision**: FIXED — documented as a plan addendum (2026-08-27); skeleton intentionally dropped (SSR-only design).

### F4 — No server-side idempotency on digest generation

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/api/digests.ts:32-34, src/lib/services/digest.ts:125
- **Detail**: Two concurrent `POST /api/digests` for the same tag would both pass the 0-note guard and each run a (paid) LLM call + insert, producing duplicate digests. The client button disables during loading (NoteCapture.tsx:210), so same-client double-clicks are mitigated, but cross-tab/retry concurrency is not guarded server-side.
- **Fix**: Acceptable at single-user MVP scale; revisit with a short-window dedupe or advisory lock if duplicate digests appear.
- **Decision**: SKIPPED — acceptable at MVP scale.

### F5 — A single >50k-char note yields an empty prompt

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/digest.ts:101-123 (`truncateNotes`)
- **Detail**: If the single most-recent note already exceeds `PROMPT_SIZE_LIMIT`, the keep-loop retains nothing (`kept = []`), and `buildUserPrompt` produces only the truncation notice with no note content — the LLM is asked to digest an empty corpus.
- **Fix**: Always keep at least the newest note (then hard-truncate its content to the limit) so the prompt is never empty.
- **Decision**: FIXED — truncateNotes now guarantees the newest note survives, hard-truncated to PROMPT_SIZE_LIMIT.

### F6 — Unconfigured LLM surfaces as a generic 500

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/digest.ts:139-142
- **Detail**: `generateDigest` calls `chatCompletion` directly without an `isLlmConfigured()` pre-check. If `OPENROUTER_API_KEY` is missing, the failure falls through to the route's generic `{ error: "Failed to generate digest" }` 500 rather than a clear "AI is not configured" message.
- **Fix**: Guard with `isLlmConfigured()` and throw a `DigestError` with a clear message (503/500) when unconfigured — mirrors the `if (!supabase)` "not configured" branch already in the route.
- **Decision**: FIXED — generateDigest now guards with isLlmConfigured() and throws DigestError("AI is not configured…", 503).

## Success Criteria

**Automated (re-verified this review):**
- `npm run lint` — PASS
- `npm run build` — PASS (server/Cloudflare build completes; only unrelated pre-existing Tailwind arbitrary-class CSS warning)
- `npx supabase db push` — NOT re-run here (needs local Supabase/Docker); committed as f3146b5 and marked done in Progress.

**Manual:** All Phase 1–3 manual items are checked `[x]` in the plan's Progress with commit stamps; changes in the diff support them (button gating, error + "Try again", `/ai` list newest-first, empty state, nav highlighting).
