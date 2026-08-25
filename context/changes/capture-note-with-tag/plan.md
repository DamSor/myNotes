# Capture Note with Tag Implementation Plan

## Overview

Deliver roadmap slice **S-01 `capture-note-with-tag`** end-to-end: a logged-in user writes a plain-text note, attaches one or more tags (typeahead over their own existing tags, with new tags created inline while writing), and immediately sees the note at the top of a flat, newest-first list whose first line is the creation date. This is the base of Stream A ("Podstawowa pętla notatki") and unblocks S-02..S-05.

Beyond the user-visible outcome, this slice **establishes the project's data-API convention** — JSON request/response, uppercase handlers, `prerender = false`, zod-validated input, DTOs in `src/types.ts`, business logic in `src/lib/services/` — that every downstream slice (S-02 digest, S-03 edit/delete, S-04 filter, S-05 search) will inherit. Getting the note/tag contract right here is the slice's highest-leverage risk.

## Current State Analysis

- **Schema is done (F-01).** `notes`, `tags`, `note_tags` exist with per-operation RLS using `(select auth.uid())`, composite owner FKs (`note_tags` links can only join a note+tag owned by the same user), case-insensitive tag uniqueness on `(user_id, lower(name))` with original casing preserved, and a newest-first index `notes(user_id, created_at desc)`. See `supabase/migrations/20260819205610_*.sql`, `..._composite_owner_fks.sql`, `..._rls_hardening.sql`.
- **Types exist but need refinement.** `src/types.ts` exports `Note`, `Tag`, `NoteTag`, and DTOs `CreateNoteDTO { content; tagIds? }`, `UpdateNoteDTO`, `CreateTagDTO`. The `tagIds`-only shape does not match FR-009 (create tags in-flow) — this slice refines it.
- **No note/tag API routes exist.** The only API precedent is `src/pages/api/auth/*.ts`: `formData()` + `context.redirect`, **no zod, no JSON**. That pattern is right for form-post auth but not for the data API this slice needs. AGENTS.md hard rules: uppercase `GET`/`POST` exports, every API route exports `const prerender = false`, zod validation, `@/` alias across top-level `src/` folders.
- **`zod` is NOT installed.** `package.json` has no zod dependency despite AGENTS.md mandating it. This slice adds it.
- **Auth/session plumbing is ready.** `src/middleware.ts` resolves `context.locals.user` on every request and gates `PROTECTED_ROUTES` (currently only `/dashboard`). `src/lib/supabase.ts` `createClient(headers, cookies)` returns an RLS-scoped SSR client (or `null` if unconfigured). `App.Locals.user` is typed in `src/env.d.ts`.
- **React island pattern is established.** `src/components/auth/*` use controlled inputs, inline validation, a shared `FormField`, `ServerError`, and `SubmitButton` (which uses `useFormStatus`). Only `ui/button` from shadcn is installed. No `src/components/hooks/` folder yet. No test runner is configured.
- **PRD constraints shaping this slice:** FR-004 (plain text only), FR-005 (flat list newest-first, date is the first line of each item), FR-009 (create tag in-flow + typeahead from own tags, variant prevention), FR-010 (one-or-many tags, no limit); NFR "save confirmation < 500ms p95"; Guardrail #2 (a user note is never lost due to a helper-process failure).

## Desired End State

Navigating to `/notes` while signed in shows the user's notes newest-first, each item leading with its creation date. A capture form lets the user type plain text, add tags via an input that suggests their existing tags as they type (and accepts a brand-new tag name), and save. On save the new note appears at the top of the list within the <500ms p95 budget, with its tags shown. A second user never sees the first user's notes or tags. `npm run lint` and `npm run build` stay green.

### Key Discoveries:

- Case-insensitive tag dedupe is already enforced at the DB by the unique index `tags(user_id, lower(name))` — the service must find-or-create against `lower(name)` to avoid unique-violation errors (`supabase/migrations/20260819205610_...sql:35`).
- The composite owner FK means `note_tags` inserts must carry `user_id` matching both parents; the service already knows `user_id` from `locals.user`, so it sets it explicitly on every link row (`..._composite_owner_fks.sql:20-26`).
- The Supabase JS client has no multi-statement transaction; write ordering must protect note durability (Guardrail #2) — see Critical Implementation Details.
- Existing pending-state UX (`SubmitButton` + `useFormStatus`) is reusable for the await-then-prepend save.
- `middleware.ts:4` `PROTECTED_ROUTES` must gain `/notes`.

## What We're NOT Doing

- **No note editing or deletion** (inline edit, delete dialog) — that's S-03. This slice is create + read only.
- **No tag management** — no rename/delete-tag UI, no tag-list admin view. Tags are created implicitly during note capture and read for typeahead.
- **No filtering by tag** (S-04) and **no text search** (S-05).
- **No AI section / digests** (S-02), no `ai_content` table.
- **No OAuth changes** (S-07) — dogfooding continues on the existing email+password session.
- **No tag max-length limit, no explicit duplicate-tag-on-note UI handling** — deferred (only set-level dedupe and blank-tag dropping happen as correctness invariants; see Critical Implementation Details).
- **No full transactional atomicity / Postgres RPC** for the multi-table write — note-first ordering is the MVP safety net; an RPC is a later hardening candidate if needed.
- **No new migration** — the F-01 schema is sufficient.
- **No automated test suite** — none is configured (AGENTS.md); verification is lint + build + manual walkthrough.

## Implementation Approach

Build the vertical in three layers, each independently verifiable: (1) a shared contract + a pure-ish data-layer service that encapsulates find-or-create-tags and note-first create-with-links and the newest-first list read; (2) thin JSON API routes that validate with zod and delegate to the service; (3) an Astro `/notes` page that SSRs the initial list and mounts a React capture island for the form, tag typeahead, and await-then-prepend.

Tag input contract: the client sends `{ content, tagNames: string[] }`. The server resolves each name case-insensitively to an existing tag or creates it, dedupes the resolved id set, then links. This is one round-trip (good for the capture NFR) and leans on the existing unique index for variant prevention.

Rendering: the React island owns the **entire** list — form, existing notes, and prepended notes all render through one component. The Astro page fetches the initial newest-first notes server-side (using the `notes(user_id, created_at desc)` index) and serializes them into the island's props as initial state, so there is a single render path (no separate SSR list markup to keep in sync) while still getting server-fetched data on first paint. On a successful create the island prepends the server-returned note to its own state — no full refetch, and the date-first-line/tag-chip markup can never diverge between "existing" and "new" rows.

## Critical Implementation Details

- **Note-first write ordering (Guardrail #2).** With no client-side transaction, the service must `insert` the note row first and treat it as committed truth. Only then resolve/create tags and insert `note_tags` links. If the tag/link step fails, the note is already saved and is returned to the user; the failure surfaces as a non-fatal warning ("note saved, tags couldn't be attached") rather than losing the note. Never order it tags-first-then-note.
- **Tag resolution is set-based and case-insensitive.** Trim each incoming tag name, drop blanks, collapse by `lower(name)` so `"Ideas"` and `"ideas"` in the same submit resolve to one tag; dedupe the final tag-id list before inserting links so the `(note_id, tag_id)` primary key never collides. This is a correctness invariant, not a user-facing feature.
- **Empty content is rejected.** Zod trims `content` and requires non-empty; internal newlines are preserved (plain text, FR-004). The client also disables submit on empty input.
- **`user_id` on links is server-set.** Never trust a client-provided `user_id`; the service stamps `locals.user.id` on the note and every link row to satisfy the composite owner FK and RLS insert policy.

## Phase 1: Contract & Data-Layer Service

### Overview

Add `zod`, refine the shared DTOs to match the FR-009 tag-in-flow contract, and create a notes service that owns tag find-or-create, note-first create-with-links, and the newest-first list read. No HTTP or UI yet.

### Changes Required:

#### 1. Add zod dependency

**File**: `package.json`

**Intent**: Provide the validation library AGENTS.md mandates for API routes; it's currently missing.

**Contract**: `zod` added to `dependencies` at its current stable version (installed via the package manager, not hand-edited). `package-lock.json` updated.

#### 2. Refine shared types / DTOs

**File**: `src/types.ts`

**Intent**: Align the create contract with tags-created-in-flow and give the read path a note-with-tags shape the list needs.

**Contract**: Entity types (`Note`, `Tag`, `NoteTag`) unchanged. Change `CreateNoteDTO` to `{ content: string; tagNames: string[] }` (names, not ids; server resolves). Add a read DTO `NoteWithTags = Note & { tags: Tag[] }` (or `{ ...Note; tags: Pick<Tag,'id'|'name'>[] }`) used by the list response. Add a **create response DTO** `CreateNoteResponse = { note: NoteWithTags; tagsAttached: boolean }` (F4) so the partial-success contract from note-first ordering (Guardrail #2) is explicit: `tagsAttached: false` means the note was saved but the tag/link step failed. Keep `UpdateNoteDTO`/`CreateTagDTO` as-is (S-03 owns updates). Update the file's header comment to note S-01 now owns the create contract.

#### 3. Zod input schemas

**File**: `src/lib/validation/notes.ts` (new) — or co-locate in the service file if preferred.

**Intent**: Single source of truth for validating note-create input, reused by the API route.

**Contract**: Export a schema validating `{ content: trimmed non-empty string; tagNames: array of strings, each trimmed; the array may be empty }`. Export the inferred type or reuse `CreateNoteDTO`. Normalization (trim, drop blanks, dedupe) may live in the schema transform or the service — pick one and keep it there.

#### 4. Notes service

**File**: `src/lib/services/notes.ts` (new)

**Intent**: Encapsulate all Supabase reads/writes for notes+tags so API routes stay thin and downstream slices reuse it. Enforces note-first ordering and set-based tag resolution.

**Contract**: Functions accepting an RLS-scoped Supabase client + `userId`:
- `listNotesWithTags(supabase, userId): Promise<NoteWithTags[]>` — newest-first (relies on the created_at desc index); joins tags via `note_tags`.
- `createNoteWithTags(supabase, userId, { content, tagNames }): Promise<CreateNoteResponse>` — inserts the note first; resolves tags via find-or-create (case-insensitive, set-deduped); inserts `note_tags` links with server-set `user_id`; returns `{ note, tagsAttached }` (F4). On a tag/link-step failure after the note is created, return the saved note with `tagsAttached: false` (do not throw away the note); on full success `tagsAttached: true`.
- `listTags(supabase, userId): Promise<Tag[]>` — all of the user's tags for typeahead.

### Success Criteria:

#### Automated Verification:

- Type checking / build passes: `npm run build`
- Lint passes: `npm run lint`
- `zod` resolves as a dependency (present in `package.json` + lockfile)

#### Manual Verification:

- Service function signatures match the DTOs in `src/types.ts` (content compiles against them).
- Reading the service confirms note-first ordering and case-insensitive, set-deduped tag resolution.

**Implementation Note**: After Phase 1 automated verification passes, pause for confirmation that the service contract reads correctly before wiring HTTP.

---

## Phase 2: API Routes

### Overview

Expose the service over JSON: create + list notes, and list tags for typeahead. Establishes the data-API convention for all downstream slices.

### Changes Required:

#### 1. Notes endpoint

**File**: `src/pages/api/notes.ts` (new)

**Intent**: Create a note (with tags) and list notes, delegating to the service.

**Contract**: `export const prerender = false;`. `POST` — parse JSON body, validate with the zod schema, get the Supabase client via `createClient(request.headers, cookies)` and the user via `locals.user`; return `401` when unauthenticated, `400` on validation error (with a JSON error body), `201` with the `CreateNoteResponse` (`{ note, tagsAttached }`, F4) on success. `GET` — return the user's `NoteWithTags[]` newest-first as JSON. Uppercase handler exports; JSON `Content-Type`.

#### 2. Tags endpoint

**File**: `src/pages/api/tags.ts` (new)

**Intent**: Provide the typeahead suggestion source (all of the user's tags).

**Contract**: `export const prerender = false;`. `GET` — auth-guard via `locals.user` (`401` if absent), return `Tag[]` (or `{id,name}[]`) for the current user as JSON. No `q` filtering (client filters in-memory at MVP scale).

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Both routes export `const prerender = false` (grep/inspection)

#### Manual Verification:

- Signed-in `POST /api/notes` with `{ content, tagNames: ["A","a"] }` returns `201`, creates one tag (not two), links it, and echoes the note with its tag.
- `POST /api/notes` with empty/whitespace `content` returns `400` and creates nothing.
- `GET /api/notes` returns the caller's notes newest-first with tags; `GET /api/tags` returns the caller's tags.
- Unauthenticated requests to either route return `401` (no data leak).
- A second user's `GET /api/notes` never returns the first user's notes (RLS holds through the API).

**Implementation Note**: After Phase 2 automated verification passes, pause for manual confirmation of the API behavior (auth, dedupe, isolation) before building UI.

---

## Phase 3: Notes UI

### Overview

Add the `/notes` protected page: the Astro page server-fetches the initial newest-first notes and the user's tags and hands them to a React island that owns the whole list UI — plain-text input, tag typeahead over the user's own tags (create-on-the-fly), the rendered list (date as first line), and await-then-prepend save.

### Changes Required:

#### 1. Protect the route

**File**: `src/middleware.ts`

**Intent**: Gate `/notes` like `/dashboard`.

**Contract**: Add `"/notes"` to `PROTECTED_ROUTES`.

#### 2. Notes page (SSR)

**File**: `src/pages/notes.astro` (new)

**Intent**: Server-fetch the initial data and host the capture island. Provides fast first paint via server-fetched data without owning any list markup itself.

**Contract**: Uses `Layout`. Reads `Astro.locals.user`; builds a Supabase client and calls the service `listNotesWithTags` + `listTags` server-side. Passes **both** the initial notes (`NoteWithTags[]`) and the tag list into the React island as props (initial state) — the page does **not** render the note list itself (the island owns it, see item 3; F1). Client directive appropriate for interactivity (e.g. `client:load`).

#### 3. Capture island

**File**: `src/components/notes/NoteCapture.tsx` (new) + a tag typeahead sub-component (e.g. `src/components/notes/TagInput.tsx`)

**Intent**: Own the full notes UI — write a plain-text note, attach tags via a chip/typeahead input that filters the user's tags as they type and accepts a new name, save, and render the list (F1).

**Contract**: The island receives `initialNotes: NoteWithTags[]` and `initialTags: Tag[]` as props and holds both in state. Controlled `content` textarea; a tag input maintaining a list of selected tag names (chips) with an in-memory filtered suggestion dropdown sourced from the island's tag state (create-on-the-fly when the typed name matches none). Submit disabled while `content` is empty/whitespace. On submit: pending state (reuse `SubmitButton`/`useFormStatus` pattern), `POST /api/notes` with `{ content, tagNames }`; on success prepend the returned note to the notes state, **merge its tags into the tag state (dedupe by id) so subsequent typeahead reflects newly created tags (F2)**, clear inputs, and — if the response signals tags were not attached (`tagsAttached: false`, F4) — surface that via `ServerError` without discarding the saved note; on error surface a message via `ServerError`. Extract reusable logic into `src/components/hooks/` per AGENTS.md.

#### 4. Note list-item rendering (within the island)

**File**: `src/components/notes/NoteCapture.tsx` (or a small presentational sub-component it imports, e.g. `src/components/notes/NoteItem.tsx`).

**Intent**: One rendering path for every note row so existing and newly prepended notes are visually identical (F1).

**Contract**: A single note-item component/shape, used by the island for all rows, with the creation date as the first line (FR-005), then content, then tag chips. Ordering is newest-first from the island's notes state (initial notes are already newest-first from the server; prepends keep the invariant). No note markup is rendered by `notes.astro`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Signing in and visiting `/notes` shows existing notes newest-first, each with the creation date as the first line.
- Typing a tag shows suggestions from the user's own tags; typing a new name and confirming attaches a brand-new tag.
- Creating a note with one new tag + one existing tag prepends it to the top with both tags shown, input clears, and the confirmation appears well under the <500ms feel locally.
- Creating a note with no tags works.
- Empty/whitespace content cannot be submitted.
- Unauthenticated access to `/notes` redirects to `/auth/signin`.
- A second user does not see the first user's notes or tag suggestions.

**Implementation Note**: After Phase 3, pause for manual confirmation of the full capture loop and the isolation spot-check before considering the slice done.

---

## Testing Strategy

### Unit Tests:

- No unit test runner is configured (AGENTS.md). Correctness is verified via `npm run lint`, `npm run build`, and the manual walkthroughs below.

### Integration Tests:

- Manual API-level checks (authenticated vs unauthenticated; case-variant tag dedupe; cross-user isolation) as enumerated in Phase 2.

### Manual Testing Steps:

1. Run `npm run dev` (local Supabase running per CLAUDE.md), sign in.
2. Visit `/notes`; confirm the list renders newest-first with the date as the first line.
3. Create a note with content + one existing tag + one new tag; confirm it prepends with both tags, input clears, feels instant.
4. Enter `"Ideas"` and `"ideas"` as tags on one note; confirm only one tag is created/linked.
5. Try to submit empty/whitespace content; confirm it's blocked client-side and (via curl) returns `400`.
6. Create a note with no tags; confirm success.
7. Sign in as a second user; confirm none of the first user's notes/tags are visible via UI or `GET /api/notes` / `GET /api/tags`.
8. Hit `/notes` while signed out; confirm redirect to `/auth/signin`.

## Performance Considerations

MVP scale is small (PRD `target_scale`: small users, low qps, small data). The `notes(user_id, created_at desc)` index serves the newest-first list; `note_tags(tag_id)` and `(user_id)` indexes cover joins/RLS scans. Typeahead filters an in-memory tag list (loaded once) — zero per-keystroke latency. Note create is a small number of writes in one request, comfortably inside the <500ms p95 save budget locally; note-first ordering adds no extra round-trip on the happy path.

## Migration Notes

No schema migration — F-01 covers the tables. No data migration. Adding `zod` is the only dependency change.

## References

- Roadmap slice S-01: `context/foundation/roadmap.md:95-105`
- Change identity: `context/changes/capture-note-with-tag/change.md`
- Completed F-01 plan (schema/RLS/types): `context/archive/2026-08-19-notes-schema-and-rls/plan.md`
- Schema migrations: `supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql`, `..._composite_owner_fks.sql`, `..._rls_hardening.sql`
- Shared types: `src/types.ts`
- Auth API precedent: `src/pages/api/auth/signin.ts`, `signup.ts`
- SSR Supabase client / auth gate: `src/lib/supabase.ts`, `src/middleware.ts:4`
- React island + form patterns: `src/components/auth/SignUpForm.tsx`, `FormField.tsx`, `SubmitButton.tsx`, `ServerError.tsx`
- PRD FR-004/005/009/010 + NFR + Guardrail #2: `context/foundation/prd.md:84-100,131-137,52`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Contract & Data-Layer Service

#### Automated

- [x] 1.1 Type checking / build passes: `npm run build` — df34a33
- [x] 1.2 Lint passes: `npm run lint` — df34a33
- [x] 1.3 `zod` resolves as a dependency (present in `package.json` + lockfile) — df34a33

#### Manual

- [x] 1.4 Service function signatures match the DTOs in `src/types.ts` — df34a33
- [x] 1.5 Service enforces note-first ordering and case-insensitive, set-deduped tag resolution — df34a33

### Phase 2: API Routes

#### Automated

- [x] 2.1 Build passes: `npm run build` — a876835
- [x] 2.2 Lint passes: `npm run lint` — a876835
- [x] 2.3 Both routes export `const prerender = false` — a876835

#### Manual

- [x] 2.4 `POST /api/notes` with `{content, tagNames:["A","a"]}` returns 201 and creates one tag, linked — a876835
- [x] 2.5 `POST /api/notes` with empty/whitespace content returns 400 and creates nothing — a876835
- [x] 2.6 `GET /api/notes` returns caller's notes newest-first with tags; `GET /api/tags` returns caller's tags — a876835
- [x] 2.7 Unauthenticated requests to both routes return 401 — a876835
- [x] 2.8 A second user's `GET /api/notes` never returns the first user's notes — a876835

### Phase 3: Notes UI

#### Automated

- [x] 3.1 Build passes: `npm run build`
- [x] 3.2 Lint passes: `npm run lint`

#### Manual

- [x] 3.3 `/notes` shows notes newest-first with creation date as the first line
- [x] 3.4 Tag input suggests the user's own tags; a new name creates a brand-new tag
- [x] 3.5 Creating a note with one new + one existing tag prepends it with both tags; input clears; feels instant
- [x] 3.6 Creating a note with no tags works
- [x] 3.7 Empty/whitespace content cannot be submitted
- [x] 3.8 Unauthenticated access to `/notes` redirects to `/auth/signin`
- [x] 3.9 A second user does not see the first user's notes or tag suggestions
