<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Weekly Summary Cron

- **Plan**: context/changes/weekly-summary-cron/plan.md
- **Scope**: Full plan — Phases 1–4 of 4
- **Date**: 2026-09-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

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

### F1 — Fallback weekly-failed inserts silently swallow errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/weekly-summary.ts:101-107, 126-131
- **Detail**: Both fallback inserts (after LLM failure and after primary insert failure) write a `kind='weekly-failed'` entry without checking the insert result. If the fallback insert itself fails (e.g. RLS misconfiguration, network error), the failure is invisible — no log, no trace. This violates lessons.md rule #2: "Don't swallow errors silently in partial-success catch — log before degrading." The original error is re-thrown, but the user-visible warning entry may silently not exist.
- **Fix A ⭐ Recommended**: Check the fallback insert result and log on failure
  - Strength: Three-line fix per call site — `const fallback = await supabase...insert(...)` then `if (fallback.error) console.error(...)`. Directly resolves the lessons.md violation and preserves the re-throw behavior.
  - Tradeoff: Minor — two call sites, a few lines each.
  - Confidence: HIGH — identical check-then-log pattern used throughout `digest.ts`.
  - Blind spot: None significant.
- **Fix B**: Wrap each fallback insert in its own try/catch with console.error
  - Strength: Catches non-PostgREST errors (e.g. network-level throws from the Supabase client) in addition to `{error}` returns.
  - Tradeoff: Slightly more verbose; the Supabase client consistently returns `{error}` rather than throwing, so the extra catch may be unnecessary ceremony.
  - Confidence: MEDIUM — defensive but over-engineered for the Supabase JS client's error contract.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/worker.ts:13-64
- **Detail**: Plan specified "Wrap entire handler body in outer try/catch with console.error for infra-level failures." Implementation covers known error paths individually (env guard, query error check, per-user try/catch) but lacks a catch-all. If `createAdminClient` or the `for...of` iteration throws unexpectedly, the rejection surfaces as an unhandled `ctx.waitUntil` error with no structured log. Risk is low in practice (Supabase client factory is synchronous, known paths are guarded), but the plan was explicit.
- **Fix**: Wrap the `runWeeklySummaries` body in a top-level `try { ... } catch (e) { console.error("weekly-summary: unexpected error", e); }`.
- **Decision**: FIXED

### F3 — Notes eligibility query has no .limit()

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: src/worker.ts:28
- **Detail**: The eligibility query `supabase.from("notes").select("user_id").gt("created_at", windowStart)` fetches all note rows in the 7-day window with no explicit limit. PostgREST's default page size (1000 rows) silently truncates the result. At MVP scale (single user, small note volume) this is harmless, but a prolific note-taker could have their count understated and miss weekly summary eligibility. Documented as client-side grouping in the inline comment ("PostgREST doesn't support GROUP BY HAVING").
- **Fix**: Add `.limit(10000)` or use a Supabase RPC wrapping a real `GROUP BY HAVING count(*) >= 3` query to push aggregation to Postgres.
- **Decision**: FIXED

### F4 — Client-side grouping drift from planned SQL aggregation

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/worker.ts:27-39
- **Detail**: Plan specified `SELECT user_id FROM notes WHERE created_at > windowStart GROUP BY user_id HAVING count(*) >= 3`. Implementation fetches all rows and groups client-side with a Map because PostgREST doesn't support GROUP BY HAVING. The deviation is documented in-code and justified by the PostgREST limitation. At MVP scale the client-side approach is fine; at larger scale the full row fetch becomes expensive (see F3).
- **Fix**: Accept as documented deviation, or create an RPC function in a future migration for server-side aggregation.
- **Decision**: ACCEPTED — documented deviation; PostgREST limitation, mitigated by F3 .limit(10000) fix
