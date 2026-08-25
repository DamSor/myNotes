# Capture Note with Tag — Plan Brief

> Full plan: `context/changes/capture-note-with-tag/plan.md`

## What & Why

Deliver roadmap slice S-01: a signed-in user writes a plain-text note, attaches one or more tags (typeahead over their own tags, new tags created inline), and sees it at the top of a flat, newest-first list with the creation date as the first line. This is the base of the core notes loop and unblocks S-02 (AI digest), S-03 (edit/delete), S-04 (filter), and S-05 (search). It also sets the project's JSON + zod data-API convention that every downstream slice inherits.

## Starting Point

The F-01 schema is done and hardened: `notes`/`tags`/`note_tags` with per-operation RLS, composite owner FKs, and case-insensitive tag uniqueness. `src/types.ts` has entity types + draft DTOs. But there are **no note/tag API routes**, **no `/notes` page**, and **`zod` isn't installed**. The only API precedent (`api/auth/*`) is form-post + redirect, not JSON — so this slice writes the data-API pattern from scratch on top of solid auth/RLS plumbing.

## Desired End State

`/notes` (protected) shows the user's notes newest-first, date-first-line, with a capture form: plain-text input, tag chips with typeahead over own tags (create-on-the-fly), and a save that prepends the new note under the <500ms feel. A second user never sees another user's notes or tags. Lint + build stay green.

## Key Decisions Made

| Decision                   | Choice                                                        | Why (1 sentence)                                                        | Source |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | ------ |
| Tag-create contract        | Client sends `tagNames`; server find-or-creates + links      | One round-trip, matches FR-009, dedupes via existing unique index.     | Plan   |
| Rendering                  | Astro server-fetches; React island owns the whole list       | One render path for existing + new rows; no SSR/island divergence.     | Plan   |
| Save UX                    | Await server, then prepend the real returned row             | Truthful ids/timestamps, no rollback logic; local writes beat 500ms.   | Plan   |
| Tag typeahead source       | Server-fetched tags in island state, refreshed on create     | Zero per-keystroke latency; newly created tags appear in later captures.| Plan   |
| Create response            | `{ note, tagsAttached }` typed in `src/types.ts`             | Makes the note-first partial-success (Guardrail #2) contract explicit. | Plan   |
| Route                      | New `/notes`, added to `PROTECTED_ROUTES`                     | Dedicated surface for the core loop; dashboard left untouched.         | Plan   |
| Write ordering             | Note-first, then tags/links (best-effort)                    | Guardrail #2: a note is never lost if the tag step fails.              | Plan   |
| Validation                 | Add `zod`; validate note input; reject empty content         | AGENTS.md mandates zod; empty notes are junk.                          | Plan   |
| Scope                      | Create + read only; no edit/delete/filter/search/tag-admin   | Keeps the slice vertical and small; those are S-03..S-05.              | Plan   |

## Scope

**In scope:**
- `zod` dependency; refined DTOs (`CreateNoteDTO { content, tagNames }`, `NoteWithTags`).
- Data-layer service (`src/lib/services/notes.ts`): find-or-create tags, note-first create-with-links, newest-first list.
- API routes: `POST`/`GET /api/notes`, `GET /api/tags` (JSON, zod, `prerender = false`).
- `/notes` page (SSR list) + React capture island with tag typeahead; `/notes` added to `PROTECTED_ROUTES`.

**Out of scope:**
- Note edit/delete (S-03), tag filter (S-04), text search (S-05), AI section (S-02), OAuth (S-07).
- Tag management (rename/delete), tag max-length, full transactional atomicity, new migrations, automated tests.

## Architecture / Approach

Three vertical layers: a service encapsulating all Supabase note/tag reads+writes (note-first ordering, set-based case-insensitive tag resolution) → thin JSON API routes that zod-validate and delegate → an Astro `/notes` page that server-fetches initial notes+tags and hands them to a React island that owns the whole list (capture + typeahead + rendered rows + await-then-prepend). `user_id` is always server-set from `locals.user`; RLS + composite FKs enforce isolation.

## Phases at a Glance

| Phase                        | What it delivers                                             | Key risk                                             |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| 1. Contract & service        | `zod`, refined DTOs, notes service (tags/create/list)       | Getting the tag contract right — downstream inherits it |
| 2. API routes                | `POST`/`GET /api/notes`, `GET /api/tags` (JSON + zod)       | Auth/RLS holding through the API; dedupe correctness |
| 3. Notes UI                  | `/notes` SSR list + capture island with typeahead          | Consistent newest-first/date-first-line UX; save feel |

**Prerequisites:** F-01 done (schema/RLS/types); local Supabase running; existing SSR auth session.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- No client-side transaction: note-first ordering is the durability guarantee, not full atomicity; a tag-step failure leaves the note saved with a soft warning.
- Typeahead loads all tags in memory — fine at MVP scale, would need server-side filtering at large tag counts.
- This slice fixes the note/tag API contract for S-02..S-05; a wrong shape here propagates downstream.

## Success Criteria (Summary)

- A user can create a plain-text note with new + existing tags and see it prepended newest-first, date-first-line, under the <500ms feel.
- Case-variant tags collapse to one; empty content is rejected; a second user sees nothing of the first.
- `npm run lint` and `npm run build` stay green.
