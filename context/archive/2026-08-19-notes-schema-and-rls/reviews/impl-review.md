<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Notes Schema and RLS Implementation Plan

- **Plan**: context/changes/notes-schema-and-rls/plan.md
- **Scope**: Phase 1 and Phase 2 of 2 (full plan)
- **Date**: 2026-08-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — note_tags ownership not enforced; "defensive composite FK" from the plan was not implemented

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql:65-71,125-127
- **Detail**: The plan's Implementation Approach (plan.md:39) states "a defensive composite FK keeps links tied to owned rows via cascade." The migration ships only single-column FKs: `note_id -> notes(id)`, `tag_id -> tags(id)`, `user_id -> auth.users(id)`. Nothing ties `note_tags.user_id` to the `user_id` of the referenced note/tag. The `note_tags` INSERT policy only checks `auth.uid() = user_id`, so an authenticated user can insert a junction row referencing a `note_id`/`tag_id` they do not own (given knowledge of the UUID). This is an integrity hole against Guardrail #1's intent. Note the plan is internally inconsistent: the Phase 1 Contract (plan.md:76-82) lists only single-column FKs, so the implementation followed the Contract but not the Approach.
- **Fix**: Add `unique (id, user_id)` on `notes` and `tags`, then make `note_tags` use composite FKs `(note_id, user_id) references notes(id, user_id) on delete cascade` and `(tag_id, user_id) references tags(id, user_id) on delete cascade` — enforcing that a link's owner equals both parents' owner. Ship as a corrective follow-up migration (forward-only).
  - Strength: Closes the integrity gap at the database layer instead of trusting S-01 app code; matches the plan's stated defensive intent.
  - Tradeoff: Requires two new unique constraints and a follow-up migration; slightly more schema surface.
  - Confidence: HIGH — composite-FK-to-parent-owner is a standard multi-tenant Postgres pattern.
  - Blind spot: The cloud DB already has the original migration applied (db push done, commit 0b5a460); this must be a new migration, not an edit to the existing file.
- **Decision**: FIXED — new migration supabase/migrations/20260820213408_note_tags_composite_owner_fks.sql

### F2 — RLS policies call `auth.uid()` unwrapped (initplan re-evaluation)

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Performance
- **Location**: supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql:85-136
- **Detail**: All 12 policies use `auth.uid() = user_id`. Supabase's own RLS performance guidance (and the `auth_rls_initplan` advisor) recommends `(select auth.uid()) = user_id` so the function is evaluated once per query instead of per row. Negligible at MVP scale, but it is the documented convention this first migration sets for all future ones.
- **Fix**: Replace `auth.uid()` with `(select auth.uid())` in all policy `using`/`with check` clauses in a follow-up migration.
- **Decision**: FIXED — supabase/migrations/20260820213409_rls_hardening.sql (all 12 policies recreated)

### F3 — `set_updated_at()` has a mutable search_path

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql:13-21
- **Detail**: `public.set_updated_at()` does not pin `search_path`. Supabase's `function_search_path_mutable` advisor flags this. Risk is low here (SECURITY INVOKER, body only sets `now()`), but pinning is the recommended hardening and keeps the linter clean.
- **Fix**: Add `set search_path = ''` (or `= pg_catalog`) to the function definition in a follow-up migration.
- **Decision**: FIXED — supabase/migrations/20260820213409_rls_hardening.sql (function recreated with `set search_path = ''`)

### F4 — note_tags carries an UPDATE policy for an immutable junction table

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql:129-132
- **Detail**: `note_tags` is a pure junction with PK `(note_id, tag_id)` and hard-delete semantics; rows are created/deleted, never updated. The plan explicitly required "4 per table × 3 tables = 12" policies (plan.md:90), so the implementation is plan-conformant — this is a critique of the plan over-specifying rather than an implementation defect. The `note_tags_update_own` policy is dead surface area.
- **Fix**: Optionally drop `note_tags_update_own` in a follow-up migration to reduce policy surface; harmless to keep.
- **Decision**: SKIPPED — plan-conformant and harmless; kept.

## Success Criteria Status

Phase 1 — Automated:
- 1.1 `supabase db reset` — not re-run (no local Supabase/Docker in review env); marked done in Progress (0b5a460).
- 1.2 Filename `YYYYMMDDHHmmss_*.sql` convention — VERIFIED (`20260819205610_...`).
- 1.3 RLS enabled on 3 tables — VERIFIED (3 `enable row level security`).
- 1.4 Exactly 12 policies — VERIFIED (12 `create policy`).
- 1.5 `npm run lint` — VERIFIED (pass).
- 1.6 `npm run build` — VERIFIED (pass, run outside sandbox).

Phase 1 — Manual (1.7–1.11): DB-dependent; not independently re-runnable in review env. Migration structure supports each claim (per-op `auth.uid()=user_id` policies, `lower(name)` unique index, cascade FKs). `db push` marked done (0b5a460).

Phase 2:
- 2.1 build / 2.2 lint — VERIFIED (pass).
- 2.3 Entity fields match columns one-to-one — VERIFIED (`Note`/`Tag`/`NoteTag` mirror the SQL columns exactly).
