# Inline Edit & Delete Note Implementation Plan

## Overview

Deliver roadmap slice **S-03 `inline-edit-and-delete-note`** end-to-end: a signed-in user, from the flat `/notes` list, edits a note's plain-text content and its tag assignment **inline** (no navigation to a separate view), and can **permanently delete** a note after confirming in a dialog. This completes the core note loop (FR-006 edit content, FR-007 edit tags, FR-008 hard delete with confirmation) on top of S-01's create+read foundation.

The slice extends — rather than reinvents — the conventions S-01 established: a data-layer service in `src/lib/services/notes.ts`, thin JSON API routes with zod validation and a shared `json()` error envelope, DTOs in `src/types.ts`, and a single React island (`NoteCapture` + `useNotes` + `NoteItem`) that owns the whole list with **await-then-update** client state. No schema migration is needed — the F-01 schema already ships UPDATE/DELETE RLS policies and `on delete cascade`.

## Current State Analysis

- **Create + read is complete and sets the pattern (S-01, done).** `src/pages/api/notes.ts` exports `POST` (create) + `GET` (list), `prerender = false`, validates with `createNoteSchema`, delegates to the service, and returns JSON via `json()` (`src/lib/http.ts`). The service (`src/lib/services/notes.ts`) has `listNotesWithTags`, `listTags`, private `findOrCreateTags` (case-insensitive, set-based, server-set `user_id`), and `createNoteWithTags` (note-first ordering, `tagsAttached` partial success). There is **no** `updateNote`/`deleteNote`.
- **DB + RLS are ready for update/delete — no migration.** `supabase/migrations/20260820213409_rls_hardening.sql` defines `notes_update_own`, `notes_delete_own`, `note_tags_update_own`, `note_tags_delete_own` (all `(select auth.uid()) = user_id`). `note_tags` FKs are `on delete cascade` (deleting a note removes its links automatically), and a `notes_set_updated_at` trigger auto-bumps `updated_at` on UPDATE. Composite owner FKs require every `note_tags` insert to carry the correct `user_id`.
- **Types are stubbed but inconsistent.** `src/types.ts` has `UpdateNoteDTO { content?; tagIds? }` — the `tagIds` shape does **not** match the create contract (`tagNames: string[]`) or the `TagInput` component (which works in names). No `UpdateNoteResponse`/delete DTOs exist.
- **No update/delete validation.** `src/lib/validation/notes.ts` has only `createNoteSchema`.
- **The island is read-only for existing rows.** `NoteItem.tsx` renders date + content + tag chips with no edit/delete affordance. `useNotes.ts` exposes only `createNote` (await POST → prepend, merge new tags). `NoteCapture.tsx` owns form + list. `TagInput.tsx` is a reusable chip/typeahead over tag **names** (create-on-the-fly), currently mounted only in the create form.
- **No dialog primitive installed.** `src/components/ui/` has only `button.tsx`. shadcn is configured ("new-york", `@radix-ui/react-slot`, `lucide-react`, `class-variance-authority` present) — `alert-dialog` must be added.
- **API surface is flat.** Only `src/pages/api/notes.ts` and `tags.ts` exist; there is no `src/pages/api/notes/` directory yet. The notes UI lives on `/notes` (`src/pages/notes.astro`), gated by `middleware.ts` `PROTECTED_ROUTES`.
- **Lessons in force** (`context/foundation/lessons.md`): every API handler wraps service/DB calls in try/catch and returns a JSON `{ error }` body on all paths (incl. 500); when a catch degrades to partial success, log before degrading; hoist shared API helpers (use the existing `json()` from `src/lib/http.ts`, don't re-copy).

## Desired End State

On `/notes`, each note row shows explicit **Edit** and **Delete** controls. Clicking **Edit** turns that row into an inline form (textarea seeded with the current content + a `TagInput` seeded with the note's current tag names) with **Save**/**Cancel**; Save is disabled while content is empty/whitespace. Saving issues `PATCH /api/notes/:id`, and on success the row is replaced in place with the server-returned note (updated content, re-synced tags, bumped `updated_at`); if the tag re-sync partially failed, a non-fatal notice appears and the content edit still persists. Clicking **Delete** opens an AlertDialog; confirming issues `DELETE /api/notes/:id` and removes the row from the list on success. A second user can never edit or delete the first user's notes (RLS holds through the API). `npm run lint` and `npm run build` stay green.

### Key Discoveries:

- UPDATE/DELETE RLS + `on delete cascade` already exist — deleting a note auto-removes its `note_tags` links; no manual link cleanup on delete (`supabase/migrations/20260820213409_rls_hardening.sql:57-66`, `..._schema_rls.sql`).
- `updated_at` is bumped by a DB trigger on UPDATE — the service must **not** set it manually (`..._schema_rls.sql` `notes_set_updated_at`).
- `findOrCreateTags` (`src/lib/services/notes.ts:59-102`) is reusable as-is for the edit tag re-sync — it already does case-insensitive, set-based find-or-create with server-set `user_id`.
- `flattenNoteRow` + the `notes(... note_tags(tags(*)))` select shape (`src/lib/services/notes.ts:18-38`) is the canonical way to return a `NoteWithTags`; the PATCH response should re-read the note through the same shape so the client gets identical data to the list.
- The create flow is deliberately **non-optimistic** (`useNotes.ts:12-42` awaits then prepends) — edit/delete should mirror this (await-then-update) for consistency.
- `TagInput` already operates on tag **names** with create-on-the-fly (`src/components/notes/TagInput.tsx`) — the edit contract using `tagNames` reuses it with zero changes.
- The edit-vs-delete hitbox conflict flagged in `roadmap.md:130` is resolved by **explicit per-row Edit/Delete buttons** (no whole-row click).

## What We're NOT Doing

- **No optimistic UI / rollback** — await-then-update only, matching the create flow.
- **No soft delete / trash / undo** — FR-008 is a hard delete; the AlertDialog is the safety net (kosz is Parked in the roadmap).
- **No orphan-tag cleanup** — removing a tag from a note leaves the `tags` row (and possibly other notes' links) intact; tag garbage-collection is out of scope.
- **No tag rename/delete management UI** — tags are still only created/attached implicitly; no tag admin view.
- **No filtering (S-04), search (S-05), AI/digests (S-02), or OAuth (S-07).**
- **No new migration** — F-01 RLS + cascade + trigger are sufficient.
- **No automated test suite** — none is configured (AGENTS.md); verification is lint + build + manual walkthrough.
- **No changes to `POST`/`GET /api/notes`, `GET /api/tags`, or `notes.astro` SSR data** beyond what edit/delete require (the island still receives the same `initialNotes`/`initialTags`).
- **No bulk edit/delete** — one note at a time.

## Implementation Approach

Build the same three-layer vertical S-01 used, each independently verifiable: (1) refine the shared contract and add service functions for update-with-tag-resync and delete; (2) expose them over a RESTful dynamic route `src/pages/api/notes/[id].ts` (`PATCH` + `DELETE`); (3) extend the island — install `alert-dialog`, add `updateNote`/`deleteNote` to `useNotes`, and give `NoteItem` an inline edit mode plus a confirm-dialog delete.

Tag-edit contract: the client sends the **full desired tag-name set** (`tagNames: string[]`), exactly like create. The service re-syncs links by diffing the current link set against the resolved target set (find-or-create names → target tag ids; delete links no longer wanted; insert links newly wanted). Content is saved **first** (content-first ordering, the delete/update analogue of S-01's note-first rule); if the tag re-sync fails after content is saved, the service returns the updated note with a partial-success flag rather than losing the content edit (Guardrail #2), logging the underlying error first (lessons.md).

## Critical Implementation Details

- **Content-first ordering on edit (Guardrail #2).** With no client-side transaction, update the note's `content` first and treat it as committed. Only then re-sync tag links. If the link step fails, return the updated note with a partial-success flag (`tagsAttached: false`) and `console.error` the cause — never throw away the saved content edit or leave the user unsure whether their edit stuck.
- **Do not set `updated_at` manually.** The `notes_set_updated_at` trigger bumps it on UPDATE; setting it in the payload is redundant and risks fighting the trigger.
- **Tag re-sync is a diff, not a wipe-and-replace-blindly.** Resolve the target `tagNames` to tag ids via `findOrCreateTags` (reused). Compute `toRemove = current − target` and `toAdd = target − current` by tag id, then delete only the stale `note_tags` rows and insert only the new ones with server-set `user_id`. Deleting-all-then-reinserting also works but generates needless writes; a diff keeps the `(note_id, tag_id)` PK collision-free and is cheaper.
- **PATCH is a partial update.** `content` and `tagNames` are each optional; only apply the fields present. An empty PATCH body (`{}`) is a no-op that returns the current note. When `content` is present it must be trimmed non-empty (FR-004); when `tagNames` is present it is the authoritative full set (an explicit `[]` clears all tags).
- **Ownership is enforced by RLS, surfaced as 404 — gate the update with a leading `SELECT`.** For `PATCH`, resolve ownership with an explicit `SELECT` of the note by `(id, user_id)` *before* mutating anything; if it returns no row, short-circuit to `404`. Do **not** infer ownership solely from the content UPDATE's affected-row count: a tags-only or empty-body PATCH performs no notes UPDATE, so there is no 0-row signal — and running `findOrCreateTags` first would create orphan tags before the composite owner FK on `note_tags` rejects the link. The leading SELECT also sidesteps the supabase-js quirk that a chained `.update()` returns no error (and needs `.select()`) to reveal 0 affected rows. For `DELETE`, the RLS-scoped `DELETE ... WHERE id AND user_id` affecting 0 rows is a sufficient 404 signal (nothing is created first). Never trust a client-supplied `user_id`.

## Phase 1: Contract & Data-Layer Service

### Overview

Align the shared DTOs with the `tagNames` edit contract, add the update/delete validation schema, and add `updateNoteWithTags` (content-first + tag-link diff, partial success) and `deleteNote` to the service. No HTTP or UI yet.

### Changes Required:

#### 1. Refine shared types / DTOs

**File**: `src/types.ts`

**Intent**: Make the edit contract consistent with create (names, not ids) and give the update path an explicit partial-success response shape.

**Contract**: Rewrite `UpdateNoteDTO` from `{ content?; tagIds? }` to `{ content?: string; tagNames?: string[] }` (both optional; a partial update). Add an update response DTO mirroring `CreateNoteResponse`: `UpdateNoteResponse = { note: NoteWithTags; tagsAttached: boolean }` (`tagsAttached: false` = content saved but tag re-sync failed). Delete needs no response DTO (the route returns `{ id }` or `204`; see Phase 2). Update the header comment noting S-03 now owns the update contract.

#### 2. Update validation schema

**File**: `src/lib/validation/notes.ts`

**Intent**: Single source of truth for validating PATCH input, reused by the API route.

**Contract**: Export `updateNoteSchema` validating `{ content?: trimmed non-empty string; tagNames?: array of trimmed strings with blanks dropped }` — both optional, mirroring `createNoteSchema`'s normalization (trim content, filter empty tag names). At least one field may be present; an empty object is valid (no-op update). Export the inferred type or reuse `UpdateNoteDTO`.

#### 3. Service: update with tag re-sync

**File**: `src/lib/services/notes.ts`

**Intent**: Encapsulate content-first update + case-insensitive tag-link diff so the route stays thin, reusing `findOrCreateTags`.

**Contract**: Add `updateNoteWithTags(supabase, userId, noteId, { content?, tagNames? }): Promise<UpdateNoteResponse | null>`. Returns `null` when the note isn't owned by the user (route maps to 404). Behavior: **gate on ownership first** — `SELECT` the note by `(id = noteId, user_id = userId)` via the RLS-scoped client; if no row, return `null` immediately (do not touch tags). Only after ownership is confirmed: if `content` present, `UPDATE notes SET content = ... WHERE id = noteId AND user_id = userId`. If `tagNames` present, resolve via `findOrCreateTags`, read current `note_tags` for the note, compute add/remove diffs by tag id, delete stale links and insert new ones with server-set `user_id`. Re-read the note through the existing `note_tags(tags(*))` select + `flattenNoteRow` and return `{ note, tagsAttached }`. On a tag-step failure after content saved, `console.error` and return `{ note, tagsAttached: false }` (content-first, Guardrail #2). Do not set `updated_at` (DB trigger owns it). The leading ownership `SELECT` is what makes the 404 path work uniformly for **every** input shape — content-only, tags-only, and empty `{}` (no-op → returns the current note) — and prevents `findOrCreateTags` from creating orphan tags for a note the caller can't touch.

#### 4. Service: delete

**File**: `src/lib/services/notes.ts`

**Intent**: Hard-delete a note the user owns; `note_tags` links cascade at the DB.

**Contract**: Add `deleteNote(supabase, userId, noteId): Promise<boolean>` — `DELETE FROM notes WHERE id = noteId AND user_id = userId` (RLS-scoped), returning `true` if a row was deleted, `false` if none matched (route → 404). Relies on `on delete cascade` for `note_tags`; no manual link deletion.

### Success Criteria:

#### Automated Verification:

- Type checking / build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Service signatures compile against the refined `UpdateNoteDTO`/`UpdateNoteResponse` in `src/types.ts`.
- Reading the service confirms content-first ordering, tag-link diffing (not blind wipe), reuse of `findOrCreateTags`, no manual `updated_at`, and `null`/`false` returns on non-owned ids.

**Implementation Note**: After Phase 1 automated verification passes, pause for confirmation that the service contract reads correctly before wiring HTTP.

---

## Phase 2: API Routes

### Overview

Expose update + delete over a RESTful dynamic route addressing a single note by id, following the S-01 route conventions (auth guard, zod, JSON error envelope on every path). List/create in `notes.ts` are untouched.

### Changes Required:

#### 1. Dynamic note route

**File**: `src/pages/api/notes/[id].ts` (new)

**Intent**: `PATCH` edits a note (content and/or tags); `DELETE` removes it. Delegates to the service.

**Contract**: `export const prerender = false;`. Read `id` from `context.params`. Both handlers: guard `context.locals.user` → `401`; build the RLS-scoped client via `createClient(request.headers, cookies)` → `500` (`{ error: "Supabase is not configured" }`) if null; wrap service calls in try/catch and return `json({ error }, 500)` on failure (lessons.md). Use the shared `json()` from `@/lib/http`.
- `PATCH`: parse JSON body (→ `400 { error: "Invalid JSON body" }` on parse failure), validate with `updateNoteSchema` (→ `400 { error: "Validation failed", issues }`), call `updateNoteWithTags(supabase, user.id, id, parsed.data)`; if it returns `null` → `404 { error: "Note not found" }`; else `200` with the `UpdateNoteResponse`.
- `DELETE`: call `deleteNote(supabase, user.id, id)`; `false` → `404 { error: "Note not found" }`; `true` → `200 { id }` (JSON body so the client can confirm; keeps the uniform JSON envelope).

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Route exports `const prerender = false` (inspection).

#### Manual Verification:

- Signed-in `PATCH /api/notes/:id` with `{ content: "edited" }` returns `200` with the updated content and unchanged tags; `updated_at` advanced.
- `PATCH` with `{ tagNames: ["A","a","new"] }` re-syncs to two tags (case-insensitive collapse), creating "new"; sending `{ tagNames: [] }` clears all tags.
- `PATCH` with empty/whitespace `content` returns `400` and changes nothing.
- `PATCH`/`DELETE` on another user's note id returns `404` (RLS 0-row), leaking no data.
- `DELETE /api/notes/:id` returns `200 { id }`, the note is gone from `GET /api/notes`, and its `note_tags` links are gone (cascade).
- Unauthenticated `PATCH`/`DELETE` returns `401`.

**Implementation Note**: After Phase 2 automated verification passes, pause for manual confirmation of the API behavior (auth, isolation → 404, tag re-sync, cascade) before building UI.

---

## Phase 3: Inline Edit + Delete UI

### Overview

Extend the island: install shadcn `alert-dialog`, add `updateNote`/`deleteNote` to `useNotes` (await-then-update), and give `NoteItem` explicit Edit/Delete controls, an inline edit form (reusing `TagInput`), and the confirm-dialog delete.

### Changes Required:

#### 1. Install AlertDialog

**File**: `src/components/ui/alert-dialog.tsx` (new, generated) + deps

**Intent**: Provide the accessible confirm modal for delete (FR-008).

**Contract**: Run `npx shadcn@latest add alert-dialog` ("new-york" style, already configured). Adds `@radix-ui/react-alert-dialog` to `package.json`. No manual edits to the generated component expected.

#### 2. Client state: update + delete

**File**: `src/components/hooks/useNotes.ts`

**Intent**: Add await-then-update mutations mirroring `createNote`.

**Contract**: Add `updateNote(noteId, { content?, tagNames? }): Promise<UpdateNoteResponse>` — `PATCH /api/notes/:id`; on success replace the matching note in `notes` state (by id, preserving list order) and merge any newly created tags into `tags` state (dedupe by id, same as create). Add `deleteNote(noteId): Promise<void>` — `DELETE /api/notes/:id`; on success remove the note from `notes` state. Both parse the JSON error envelope into a thrown `Error` on non-ok (reuse the existing `createNote` error-extraction pattern). Return them from the hook.

#### 3. Note row: edit/delete affordances + inline edit form

**File**: `src/components/notes/NoteItem.tsx`

**Intent**: Add explicit Edit + Delete buttons and an inline edit mode; resolve the edit-vs-delete hitbox conflict with distinct controls (no whole-row click).

**Contract**: `NoteItem` gains props `onUpdate(noteId, patch)` and `onDelete(noteId)` (wired from `NoteCapture`/`useNotes`). Read (default) mode: current display + a small Edit and Delete control (icon buttons, e.g. `lucide-react` `Pencil`/`Trash2`; Delete uses the `destructive` button variant or opens the dialog trigger). Edit mode (local `isEditing` state): a textarea seeded with `note.content` and a `TagInput` seeded with `note.tags.map(t => t.name)`, plus Save/Cancel. Save disabled while trimmed content is empty; on Save call `onUpdate` with the changed fields, exit edit mode on success, and if the response's `tagsAttached === false` surface a non-fatal notice (reuse `ServerNotice`); on error show the message (reuse `ServerError`). Cancel restores the original values and exits edit mode. Delete control opens an `AlertDialog` ("Delete this note? This can't be undone."); confirm calls `onDelete`; while the request is in flight, disable the confirm action.

#### 4. Wire handlers into the island

**File**: `src/components/notes/NoteCapture.tsx`

**Intent**: Pass the new `updateNote`/`deleteNote` from `useNotes` down to each `NoteItem`.

**Contract**: Destructure `updateNote`, `deleteNote` from `useNotes` and pass them to `<NoteItem note onUpdate onDelete />`. No change to the create form. (Row-level pending/error state lives in `NoteItem`, so the island stays thin.)

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- On `/notes`, each row shows Edit and Delete controls; the list is unchanged at rest.
- Clicking Edit turns the row into a form seeded with current content + tag chips; Save is disabled when content is blanked.
- Editing content only and saving replaces the row in place with the new content; the created date is unchanged and ordering is preserved.
- Editing tags (add an existing tag, add a brand-new tag, remove one) and saving reflects the new tag set on the row; the new tag becomes available in later typeahead.
- Cancel discards changes and returns the row to read mode.
- Clicking Delete opens the confirm dialog; confirming removes the row and it stays gone after reload; dismissing the dialog keeps the note.
- A partial tag-attach failure surfaces a non-fatal notice while the content edit persists (hard to force manually — verify the code path and the notice wiring).
- Signed-out access to `/notes` still redirects to `/auth/signin`; a second user cannot edit/delete the first user's notes (spot-check via API → 404).

**Implementation Note**: After Phase 3, pause for manual confirmation of the full edit + delete loop and the isolation spot-check before considering the slice done.

---

## Testing Strategy

### Unit Tests:

- No unit test runner is configured (AGENTS.md). Correctness is verified via `npm run lint`, `npm run build`, and the manual walkthroughs below.

### Integration Tests:

- Manual API-level checks: PATCH content-only, PATCH tags (case-variant collapse, create-new, clear-all), PATCH empty content → 400, PATCH/DELETE non-owned id → 404, DELETE cascade of `note_tags`, unauthenticated → 401.

### Manual Testing Steps:

1. Run `npm run dev` (local Supabase per CLAUDE.md), sign in, visit `/notes` with a few existing notes.
2. Edit a note's content only; confirm the row updates in place, date unchanged, order preserved.
3. Edit a note's tags: add an existing tag, add a new tag, remove one; confirm the row reflects the new set and the new tag appears in later typeahead.
4. Enter `"Ideas"` and `"ideas"` while editing tags; confirm only one tag is linked.
5. Blank the content in edit mode; confirm Save is disabled and (via curl) `PATCH` with empty content returns `400`.
6. Cancel an edit; confirm no change persisted.
7. Delete a note: confirm the dialog appears, confirming removes it (gone after reload), dismissing keeps it.
8. As a second user, `PATCH`/`DELETE` the first user's note id via curl; confirm `404` and no mutation.
9. Hit `/notes` signed out; confirm redirect to `/auth/signin`.

## Performance Considerations

MVP scale is small. Update touches one note row + a small tag-link diff (a couple of writes) in one request — comfortably within the <500ms feel. Delete is a single `DELETE` with DB-side cascade. Tag re-sync reuses the in-memory `findOrCreateTags` (one tag fetch), adding no per-keystroke cost. The row-replace/remove in `useNotes` is O(n) over a small client list.

## Migration Notes

No schema migration — F-01 already provides UPDATE/DELETE RLS policies, `on delete cascade` on `note_tags`, and the `notes_set_updated_at` trigger. The only dependency change is shadcn `alert-dialog` (`@radix-ui/react-alert-dialog`).

## References

- Roadmap slice S-03: `context/foundation/roadmap.md:121-131`
- Change identity: `context/changes/inline-edit-and-delete-note/change.md`
- S-01 plan (conventions this extends): `context/archive/2026-08-25-capture-note-with-tag/plan.md`
- F-01 schema/RLS/trigger/cascade: `supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql`, `..._composite_owner_fks.sql`, `20260820213409_rls_hardening.sql`
- Service to extend: `src/lib/services/notes.ts` (`findOrCreateTags`, `flattenNoteRow`, select shape)
- Validation: `src/lib/validation/notes.ts`
- Shared types: `src/types.ts`
- API conventions + shared helper: `src/pages/api/notes.ts`, `src/lib/http.ts`
- Island + row + hook + tag input: `src/components/notes/NoteCapture.tsx`, `NoteItem.tsx`, `TagInput.tsx`, `src/components/hooks/useNotes.ts`
- Lessons (JSON envelope, log-before-degrade, hoist helpers): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Contract & Data-Layer Service

#### Automated

- [x] 1.1 Type checking / build passes: `npm run build` — 992c1f0
- [x] 1.2 Lint passes: `npm run lint` — 992c1f0

#### Manual

- [x] 1.3 Service signatures compile against refined `UpdateNoteDTO`/`UpdateNoteResponse` — 992c1f0
- [x] 1.4 Service confirms content-first ordering, tag-link diffing, `findOrCreateTags` reuse, no manual `updated_at`, `null`/`false` on non-owned ids — 992c1f0

### Phase 2: API Routes

#### Automated

- [x] 2.1 Build passes: `npm run build`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Route exports `const prerender = false`

#### Manual

- [x] 2.4 `PATCH` content-only returns 200 with updated content, unchanged tags, advanced `updated_at`
- [x] 2.5 `PATCH` tags re-syncs (case-insensitive collapse, create-new, `[]` clears all)
- [x] 2.6 `PATCH` empty/whitespace content returns 400 and changes nothing
- [x] 2.7 `PATCH`/`DELETE` on another user's note id returns 404, no leak
- [x] 2.8 `DELETE` returns 200 `{ id }`; note gone from `GET /api/notes`; `note_tags` links cascaded
- [x] 2.9 Unauthenticated `PATCH`/`DELETE` returns 401

### Phase 3: Inline Edit + Delete UI

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Each row shows Edit + Delete controls; list unchanged at rest
- [ ] 3.4 Edit opens an inline form seeded with content + tag chips; Save disabled when content blank
- [ ] 3.5 Content-only edit replaces the row in place; date unchanged, order preserved
- [ ] 3.6 Tag edit (add existing, add new, remove) reflects on the row; new tag appears in later typeahead
- [ ] 3.7 Cancel discards changes and returns to read mode
- [ ] 3.8 Delete opens confirm dialog; confirm removes row (stays gone after reload); dismiss keeps note
- [ ] 3.9 Partial tag-attach failure surfaces a non-fatal notice while content edit persists (code-path verified)
- [ ] 3.10 Signed-out `/notes` redirects; second user cannot edit/delete first user's notes (404)
