# Notes Schema and RLS — Plan Brief

> Full plan: `context/changes/notes-schema-and-rls/plan.md`

## What & Why

Create the first Supabase migration for MyNotes — `notes`, `tags`, `note_tags` — with per-operation Row Level Security so every authenticated user can operate only on their own rows. This is Foundation F-01: the data-isolation guardrail (Guardrail #1) is binary — one missing policy = MVP failure — so it must be correct before `S-01` writes any user data.

## Starting Point

`supabase/migrations/` is empty; this is the very first migration. Auth already works via Supabase SSR (`src/lib/supabase.ts`, `src/middleware.ts`), so RLS keys off `auth.uid()`. No `src/types.ts` exists yet, and no note/tag API routes exist (those are S-01).

## Desired End State

Three tables exist in both the local and cloud Supabase projects with RLS enabled and 12 per-operation policies. A cross-account access attempt returns nothing. `src/types.ts` exports entity + DTO types matching the schema, giving S-01 a stable contract.

## Key Decisions Made

| Decision              | Choice                                                             | Why (1 sentence)                                              | Source |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| Primary keys          | `uuid` default `gen_random_uuid()`                                 | Non-guessable ids, standard Supabase convention.             | Plan   |
| Tag uniqueness        | Unique index on `(user_id, lower(name))`, original casing kept     | Prevents case-variant drift for typeahead (FR-009).          | Plan   |
| note_tags ownership   | Denormalized `user_id` column                                      | RLS becomes a direct `auth.uid() = user_id` check, no joins. | Plan   |
| Cascade behavior      | `on delete cascade` on all FKs                                     | Hard delete throughout, no orphans (FR-008).                 | Plan   |
| RLS granularity       | Per-operation policies for role `authenticated`, USING+WITH CHECK  | Matches AGENTS.md granular RLS rule; tightest control.       | Plan   |
| Apply workflow        | Local `supabase db reset` → verify → `supabase db push` to cloud   | Catch mistakes locally before touching the linked project.   | Plan   |
| Types                 | Hand-written types in `src/types.ts` now                           | S-01 inherits a stable contract without a generated file.    | Plan   |

## Scope

**In scope:**
- Migration: `notes`, `tags`, `note_tags` tables, constraints, indexes, `updated_at` trigger.
- RLS enablement + 12 per-operation policies (4 per table).
- Shared TypeScript entity/DTO types in `src/types.ts`.

**Out of scope:**
- `ai_content` (S-02), `ai_run_failures` (Parked).
- API endpoints, zod schemas, UI (S-01).
- Full-text/`tsvector`/trigram search index (S-05).
- OAuth changes (S-07), seed data, generated `Database` types.

## Architecture / Approach

One timestamped SQL file creates all three tables plus their RLS policies atomically (a table never exists without policies). Ownership is a direct `auth.uid() = user_id` check on every table — `note_tags` denormalizes `user_id` to avoid join-based policies. FKs reference `auth.users(id)` with cascade. Verify locally, then push to cloud; add matching TS types last.

## Phases at a Glance

| Phase                        | What it delivers                                        | Key risk                                            |
| ---------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| 1. Schema + RLS migration    | 3 tables, indexes, trigger, RLS + 12 policies applied   | A missing/incorrect policy = data-isolation failure |
| 2. Shared TypeScript types   | `Note`/`Tag`/`NoteTag` + DTOs in `src/types.ts`         | Type/schema drift if columns and types disagree     |

**Prerequisites:** Supabase cloud project linked (baseline); Docker for local `supabase db reset`.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Application code (S-01) must set `note_tags.user_id` consistent with the parent note/tag; the insert policy + cascade FKs are the safety net, not full referential enforcement of "note and tag belong to the same user."
- Assumes Docker is available locally for `supabase db reset`; if not, verification falls back to cloud push + introspection.
- DTO field names are a first proposal; S-01 owns the final API contract.

## Success Criteria (Summary)

- `supabase db reset` applies cleanly locally and `db push` applies to cloud; RLS enabled with 12 policies.
- A second user cannot read, update, or delete another user's notes/tags/links.
- `src/types.ts` types match the schema; `npm run lint` and `npm run build` stay green.
