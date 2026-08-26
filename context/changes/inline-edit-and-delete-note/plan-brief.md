# Inline Edit & Delete Note — Plan Brief

> Full plan: `context/changes/inline-edit-and-delete-note/plan.md`

## What & Why

Roadmap slice **S-03**: let a signed-in user edit a note's plain-text content and its tag assignment **inline** in the `/notes` list (no separate view), and **hard-delete** a note after confirming in a dialog (FR-006/007/008). This closes the core note CRUD loop on top of S-01's create+read foundation, keeping notes trustworthy to manage (Guardrail #2).

## Starting Point

Create + read is done: a JSON API (`src/pages/api/notes.ts`), a service (`src/lib/services/notes.ts` with `findOrCreateTags`, `createNoteWithTags`, `listNotesWithTags`), and a single React island (`NoteCapture` + `useNotes` + read-only `NoteItem` + `TagInput`) that owns the `/notes` list with await-then-update state. The DB already has UPDATE/DELETE RLS, `on delete cascade`, and an `updated_at` trigger — but there is no update/delete service, route, validation, or UI, and no dialog component installed.

## Desired End State

Each note row shows explicit **Edit** and **Delete** controls. Edit turns the row into an inline form (content textarea + `TagInput` seeded with current values, Save/Cancel); saving `PATCH`es and replaces the row in place. Delete opens an AlertDialog; confirming `DELETE`s and removes the row. Cross-user edit/delete is impossible (RLS → 404). Lint + build stay green.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| API route shape | Dynamic `src/pages/api/notes/[id].ts` (PATCH + DELETE) | RESTful, leaves list/create `notes.ts` untouched | Plan |
| Tag edit contract | `tagNames: string[]` (same as create) | Reuses `findOrCreateTags` + `TagInput`, allows new tags mid-edit; rewrites `UpdateNoteDTO` | Plan |
| Edit trigger UX | Explicit per-row Edit + Delete buttons | Resolves the edit-vs-delete hitbox conflict flagged in the roadmap | Plan |
| Delete confirm | Install shadcn `alert-dialog` | Accessible modal matching the configured "new-york" style; reusable for S-06 | Plan |
| Edit partial failure | Content-first save + `tagsAttached` flag | Mirrors create's Guardrail #2 partial-success; never loses the content edit | Plan |
| Empty content | Rejected (Save disabled + zod), same as create | Prevents junk/blank notes (FR-004); delete is the separate action | Plan |
| Client update model | Await server, then replace/remove row | Consistent with the deliberately non-optimistic create flow | Plan |

## Scope

**In scope:** PATCH (content and/or tags) + DELETE endpoints; `updateNoteWithTags` (content-first, tag-link diff) + `deleteNote` service; `updateNoteSchema`; refined DTOs; inline edit mode + Edit/Delete controls on `NoteItem`; `updateNote`/`deleteNote` in `useNotes`; shadcn AlertDialog.

**Out of scope:** optimistic UI, soft delete/trash/undo, orphan-tag cleanup, tag admin UI, filter/search/AI/OAuth, new migration, automated tests, bulk actions.

## Architecture / Approach

Three-layer vertical mirroring S-01: (1) service + contract — `updateNoteWithTags` saves content first, then diffs tag links (reusing `findOrCreateTags`), returning a partial-success flag; `deleteNote` hard-deletes (links cascade); (2) a dynamic `notes/[id].ts` route exposing `PATCH`/`DELETE` with auth guard, zod, and the shared JSON error envelope, mapping non-owned ids to 404; (3) the island gains `updateNote`/`deleteNote` (await-then-update) and `NoteItem` gains an inline edit form + AlertDialog delete.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Contract & Service | DTOs, `updateNoteSchema`, `updateNoteWithTags` + `deleteNote` | Tag-link diff correctness; content-first partial success |
| 2. API Routes | `notes/[id].ts` PATCH + DELETE with 401/400/404/500 | RLS 0-row → 404 mapping; JSON envelope on every path |
| 3. Edit + Delete UI | Inline edit form, Edit/Delete controls, AlertDialog | Edit-vs-delete hitbox clarity; row-level pending/error state |

**Prerequisites:** S-01 done (it is); local Supabase running for manual verification.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- Edit and delete controls share the same row — mitigated by explicit distinct buttons (no whole-row click), but visual density on the row needs a quick design pass.
- Tag re-sync partial failure is hard to force in manual testing; the code path + notice wiring is verified by reading, not by reproduction.
- Hard delete is irreversible by design (no trash) — the AlertDialog is the only guard.

## Success Criteria (Summary)

- A user can edit a note's content and tags inline and see the row update in place, and delete a note after confirming.
- Empty content can't be saved; a second user can never edit/delete another user's notes (404).
- `npm run lint` and `npm run build` stay green; no regression to create/list.
