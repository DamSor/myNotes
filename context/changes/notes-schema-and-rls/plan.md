# Notes Schema and RLS Implementation Plan

## Overview

Establish the first domain schema for MyNotes in Supabase: `notes`, `tags`, and `note_tags`, each protected by per-operation Row Level Security so every authenticated user can operate only on their own rows. This is Foundation F-01 from the roadmap — the binary data-isolation guardrail (Guardrail #1) that must be correct before `S-01 capture-note-with-tag` starts writing user data. The change is database-only plus a shared TypeScript type contract; no API routes or UI (those belong to S-01).

## Current State Analysis

- `supabase/migrations/` is empty — this is the very first migration. `supabase/config.toml` has `[db.migrations] enabled = true`, Postgres `major_version = 17`, schema `public`, and `project_id = "10x-astro-starter"` (cloud project already linked per roadmap baseline).
- Auth is Supabase SSR via `@supabase/ssr` (`src/lib/supabase.ts`), with `src/middleware.ts` resolving `context.locals.user` and gating `/dashboard`. RLS must therefore key off `auth.uid()` against `auth.users`.
- `src/types.ts` does **not** exist yet; `App.Locals.user` (`src/env.d.ts`) is typed as the Supabase `User`. The `@/*` alias maps to `./src/*`.
- No note/tag API routes exist. API convention (`src/pages/api/auth/*.ts`) uses uppercase handler exports; per AGENTS.md, zod validation and DTOs in `src/types.ts` are the norm — but endpoints are out of scope here.
- Domain constraints from PRD that shape the schema: plain-text notes (FR-004), flat list newest-first (FR-005), inline edit (FR-006/007), hard delete, no trash (FR-008), tag typeahead with variant prevention (FR-009), many tags per note (FR-010), single-tag filter (FR-011), case-insensitive substring search later (FR-020, slice S-05).

## Desired End State

A single migration, applied cleanly to both a local Supabase instance and the cloud project, creates the three tables with RLS enabled and per-operation policies. A cross-account access attempt returns zero rows / is rejected. `src/types.ts` exports entity and DTO types matching the schema. Verified by: `supabase db reset` succeeds locally, an RLS isolation smoke test shows no cross-user leakage, `supabase db push` applies to cloud, and `npm run lint` + `npm run build` stay green.

### Key Discoveries:

- Empty `supabase/migrations/` (`supabase/config.toml:53-58`) — no prior schema or naming precedent; this migration sets the convention.
- RLS must use `auth.uid()` (Supabase SSR session), matching the auth flow in `src/lib/supabase.ts:9-23`.
- AGENTS.md hard rule: migrations named `YYYYMMDDHHmmss_short_description.sql`, RLS enabled on every new table with granular per-operation, per-role policies.
- No `src/types.ts` yet — this change creates it; S-01 will extend it.

## What We're NOT Doing

- No `ai_content` table (lands in S-02), no `ai_run_failures` table (Parked).
- No API endpoints, no UI, no zod schemas (all S-01).
- No full-text search index / `tsvector` / trigram (S-05 decides; MVP uses `ILIKE`).
- No generated `Database` type via `supabase gen types` — hand-written entity/DTO types in `src/types.ts` instead.
- No seed data.
- No OAuth/provider changes (S-07).

## Implementation Approach

Write one timestamped SQL migration that creates all three tables together with their constraints, indexes, an `updated_at` trigger, then enables RLS and defines per-operation policies for the `authenticated` role in the same file (a table must never exist without its policies). Verify locally with `supabase db reset` before pushing to the linked cloud project. Then add matching hand-written TypeScript types in `src/types.ts`.

Ownership model: `notes.user_id` and `tags.user_id` reference `auth.users(id)`; `note_tags` denormalizes `user_id` so every table's RLS is a direct `auth.uid() = user_id` check (no cross-table joins in policies — simpler and faster). Application code (S-01) is responsible for setting `note_tags.user_id` consistently with the parent rows; a defensive composite FK keeps links tied to owned rows via cascade.

## Critical Implementation Details

- **Tag uniqueness** — enforce a unique index on `(user_id, lower(name))` to prevent case-variant drift ("Ideas"/"ideas") per FR-009, while storing the original casing in `name`. This is a functional-index unique constraint, not a plain `UNIQUE(user_id, name)`.
- **note_tags composite FKs + cascade** — the two FKs (`note_id`, `tag_id`) are both `on delete cascade`, so deleting a note or a tag removes its links (hard delete throughout, FR-008). Primary key is the `(note_id, tag_id)` pair.
- **updated_at trigger ordering** — the trigger must be `before update` so the new `updated_at` value is written in the same row version, not a follow-up write.

## Phase 1: Schema + RLS Migration

### Overview

Create the three tables with constraints, indexes, and an `updated_at` trigger, then enable RLS and add per-operation policies — all in one migration file.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_notes_tags_note_tags_schema_rls.sql` (timestamp generated at authoring time)

**Intent**: Stand up the full notes/tags/note_tags schema with per-user data isolation so S-01 can safely read/write. Single file so tables and their RLS policies land atomically.

**Contract**: Objects and invariants created by this file —

- `tags`
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `name text not null` (original casing preserved)
  - `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
  - Unique index `tags_user_id_lower_name_key` on `(user_id, lower(name))`
  - Index on `(user_id)`
- `notes`
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `content text not null` (plain text, FR-004)
  - `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
  - Index on `(user_id, created_at desc)` for newest-first list (FR-005)
- `note_tags`
  - `note_id uuid not null references notes(id) on delete cascade`
  - `tag_id uuid not null references tags(id) on delete cascade`
  - `user_id uuid not null references auth.users(id) on delete cascade` (denormalized for direct RLS)
  - `created_at timestamptz not null default now()`
  - Primary key `(note_id, tag_id)`
  - Index on `(tag_id)` for single-tag filter (FR-011); index on `(user_id)`
- `updated_at` trigger: one `before update` trigger function (e.g. `set_updated_at()`) applied to `notes` and `tags`, setting `new.updated_at = now()`.
- `alter table ... enable row level security` on all three tables.
- Per-operation RLS policies for role `authenticated` on each table:
  - `select` — `USING (auth.uid() = user_id)`
  - `insert` — `WITH CHECK (auth.uid() = user_id)`
  - `update` — `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
  - `delete` — `USING (auth.uid() = user_id)`
  - (12 policies total: 4 per table × 3 tables.)

### Success Criteria:

#### Automated Verification:

- Local DB applies migration cleanly: `npx supabase db reset`
- Migration filename matches `YYYYMMDDHHmmss_*.sql` convention
- RLS is enabled on all three tables (query `pg_tables.rowsecurity` / `pg_class.relrowsecurity` = true for `notes`, `tags`, `note_tags`)
- Exactly 12 policies exist across the three tables (query `pg_policies`)
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- With two test users (A and B), user A cannot `SELECT`/`UPDATE`/`DELETE` user B's notes/tags/note_tags (returns 0 rows / no effect) when using an `authenticated` session token.
- Inserting a `note_tags` row whose `user_id` differs from `auth.uid()` is rejected by the insert policy.
- Creating a tag `"Ideas"` then `"ideas"` for the same user violates the unique index (case-insensitive).
- Deleting a note removes its `note_tags` rows; deleting a tag removes its `note_tags` rows (cascade).
- `npx supabase db push` applies the migration to the cloud project without error.

**Implementation Note**: After Phase 1 automated verification passes, pause for manual confirmation of the RLS isolation and cascade checks (and the cloud `db push`) before proceeding to Phase 2.

---

## Phase 2: Shared TypeScript Types

### Overview

Add hand-written entity and DTO types matching the schema so S-01 (and later slices) build against a stable contract.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts` (new)

**Intent**: Provide the canonical TypeScript shapes for the three entities plus create/update DTOs, mirroring the SQL columns exactly (uuid → string, timestamptz → string ISO).

**Contract**: Exported types —

- `Note` — `{ id: string; user_id: string; content: string; created_at: string; updated_at: string }`
- `Tag` — `{ id: string; user_id: string; name: string; created_at: string; updated_at: string }`
- `NoteTag` — `{ note_id: string; tag_id: string; user_id: string; created_at: string }`
- `CreateNoteDTO` — `{ content: string; tagIds?: string[] }` (shape S-01 will validate with zod; ids resolved server-side)
- `UpdateNoteDTO` — `{ content?: string; tagIds?: string[] }`
- `CreateTagDTO` — `{ name: string }`

(DTO field names are a first proposal; S-01 owns the final API contract and may refine. Entity types must match the schema exactly.)

### Success Criteria:

#### Automated Verification:

- Type checking / build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Entity type fields match the migration columns one-to-one (names, nullability, types).

---

## Testing Strategy

### Unit Tests:

- No unit test runner is configured in this repo (per AGENTS.md). Verification is via `supabase db reset`, `pg_policies`/`pg_class` introspection queries, and `npm run lint` / `npm run build`.

### Integration Tests:

- Manual RLS isolation check with two users (A/B) exercising each operation (select/insert/update/delete) across all three tables.

### Manual Testing Steps:

1. `npx supabase db reset` — confirm the migration applies with no errors.
2. In the local SQL editor / psql, confirm `relrowsecurity = true` for all three tables and 12 rows in `pg_policies`.
3. Create two auth users; as user A, insert a note + tag + link; as user B (authenticated), attempt to read/update/delete A's rows — expect none.
4. Attempt to insert a `note_tags` row with a foreign `user_id` — expect rejection.
5. Insert tag `"Ideas"`, then `"ideas"` for the same user — expect unique violation.
6. Delete a note and a tag — confirm cascade removes `note_tags` rows.
7. `npx supabase db push` — confirm cloud apply.

## Performance Considerations

MVP scale is small (PRD `target_scale`: small users, low qps, small data). Indexes provided: `notes(user_id, created_at desc)` for the newest-first list, `note_tags(tag_id)` for single-tag filter, `(user_id)` indexes for RLS-scoped scans. No full-text index yet (deferred to S-05).

## Migration Notes

No existing data to migrate — first migration on an empty schema. Rollback for local dev is `supabase db reset`; on cloud, a corrective follow-up migration would drop the objects if needed (no down-migration file, consistent with Supabase's forward-only migration model).

## References

- Roadmap item F-01: `context/foundation/roadmap.md`
- Change identity: `context/changes/notes-schema-and-rls/change.md`
- PRD Access Control + Guardrail #1: `context/foundation/prd.md:49-53,150-158`
- Supabase SSR client (auth.uid source): `src/lib/supabase.ts:9-23`
- Migration config: `supabase/config.toml:53-58`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + RLS Migration

#### Automated

- [x] 1.1 Local DB applies migration cleanly: `npx supabase db reset`
- [x] 1.2 Migration filename matches `YYYYMMDDHHmmss_*.sql` convention
- [x] 1.3 RLS enabled on all three tables (`relrowsecurity` = true)
- [x] 1.4 Exactly 12 policies exist across the three tables (`pg_policies`)
- [x] 1.5 Lint passes: `npm run lint`
- [x] 1.6 Build passes: `npm run build`

#### Manual

- [x] 1.7 Two-user RLS isolation: A cannot select/update/delete B's rows
- [x] 1.8 Insert of `note_tags` with foreign `user_id` is rejected
- [x] 1.9 Case-insensitive tag uniqueness violation ("Ideas"/"ideas")
- [x] 1.10 Cascade deletes remove `note_tags` on note/tag delete
- [x] 1.11 `npx supabase db push` applies to cloud without error

### Phase 2: Shared TypeScript Types

#### Automated

- [ ] 2.1 Type checking / build passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 Entity type fields match migration columns one-to-one
