# Edit or Delete Digest Implementation Plan

## Overview

Deliver roadmap slice **S-06 `edit-or-delete-digest`**: a signed-in user in the "AI for me" section can edit a digest's body inline (implicit accept) or soft-delete it via a confirmation dialog (explicit reject). An "edited" indicator distinguishes touched digests from untouched ones. Acceptance signals (no-op / edit / delete) are derivable from the existing `updated_at` column and a new `deleted_at` column, feeding the Primary metric "≥70% acceptance". The edit/delete service layer is generic over all `ai_content` kinds so S-08 weekly summaries inherit the same operations for free.

## Current State Analysis

S-02 shipped the `ai_content` table, digest generation, and a read-only `/ai` page with `DigestList`. S-03 established the inline-edit + delete pattern for notes across three layers (service → dynamic API route → React island with `useNotes` hook, `NoteItem` component, `AlertDialog`). The `ai_content` migration already includes UPDATE and DELETE RLS policies, an `updated_at` trigger, and a tag-name join index. What's missing: no `deleted_at` column for soft-delete, no update/delete service functions, no PATCH/DELETE API endpoint, no client-state hook, and `DigestList` has no edit/delete controls.

### Key Discoveries:

- UPDATE/DELETE RLS on `ai_content` already exist — `supabase/migrations/20260827203449_ai_content_table.sql:48-55`; no RLS changes needed
- `set_updated_at()` trigger fires on UPDATE — `ai_content_set_updated_at` at line 30; don't set `updated_at` manually
- `DigestList.tsx` is SSR-only (receives `initialDigests`, no client refetch) — needs a `useDigests` hook for instant updates
- `AlertDialog` is already installed from S-03 — no new shadcn component needed
- `fetchLastDigestForTag` (digest.ts:48-67) queries all digests for watermark — soft-deleted digests still count as watermarks (prevents re-digesting the same notes after a rejection); no change needed
- S-03 `NoteItem` pattern (NoteItem.tsx:43-253) is the direct template: `isEditing` toggle, explicit Edit/Delete buttons, textarea + Save/Cancel, AlertDialog with controlled open state, ref guards against double-submit, await-then-update
- `json()` helper in `src/lib/http.ts` for uniform API responses

## Desired End State

On `/ai`, each digest card shows Edit (pencil) and Delete (trash) icon buttons. Clicking Edit opens the body in a textarea with Save/Cancel; Save is disabled while content is empty. Saving issues `PATCH /api/ai-content/:id` and replaces the card in place with the server-returned data; an "edited" label appears next to the date. Clicking Delete opens an AlertDialog; confirming issues `DELETE /api/ai-content/:id`, soft-deletes the row (sets `deleted_at`), and removes the card from the list instantly. The 70% acceptance metric is derivable: `deleted_at IS NOT NULL` = rejected; `updated_at > created_at` on non-deleted rows = edited (accepted); `updated_at = created_at` on non-deleted rows = implicit accept. A second user can never edit or delete the first user's ai_content (RLS). `npm run lint` and `npm run build` stay green.

## What We're NOT Doing

- **No hard delete** — soft delete preserves the rejection signal for the 70% metric
- **No re-generation on delete** — deleting a digest doesn't re-trigger generation; the watermark still stands
- **No acceptance metric dashboard/UI** — signals are stored but not aggregated or displayed in MVP
- **No edit of the source tag** — `source_tag_id` is informational (which tag was digested), not user-editable
- **No weekly summary edit/delete UI** — S-08 isn't built yet; the generic service is ready but no UI wires it
- **No optimistic UI / rollback** — await-then-update only, matching S-03
- **No RLS changes** — keeping soft-deleted rows queryable (for future metric aggregation) by not filtering `deleted_at` in RLS
- **No automated tests** — none configured (AGENTS.md); verification via lint + build + manual

## Implementation Approach

Mirror S-03's three-layer vertical slice, simplified (body-only edit, no tag re-sync):

1. **Data Layer** — migration adds `deleted_at` to `ai_content`; new DTO types for update
2. **Service + API** — generic `updateAiContent`/`softDeleteAiContent` in `digest.ts`, validation, `PATCH`/`DELETE` on `/api/ai-content/[id]`; update `listDigests` to filter soft-deleted rows
3. **Frontend** — `useDigests` hook, extract `DigestItem` with inline edit + AlertDialog delete + "edited" indicator, wire into `DigestList`

---

## Phase 1: Data Layer + Types

### Overview

Add the `deleted_at` column to `ai_content` via migration, and define the update DTO and response type in `src/types.ts`.

### Changes Required:

#### 1. Migration: add deleted_at column

**File**: `supabase/migrations/YYYYMMDDHHmmss_ai_content_soft_delete.sql`

**Intent**: Enable soft-delete tracking for the 70% acceptance metric. Soft-deleted rows stay in the table (queryable for metrics) but are filtered out in application list queries.

**Contract**: `ALTER TABLE public.ai_content ADD COLUMN deleted_at timestamptz NULL DEFAULT NULL;` No RLS changes — the existing select/update policies don't reference `deleted_at`, keeping soft-deleted rows queryable by the owning user. No new index — the existing `ai_content_user_id_created_at_idx` is sufficient; the `deleted_at IS NULL` filter is applied in application queries on an already-small result set (MVP scale).

#### 2. Update DTO and response type

**File**: `src/types.ts`

**Intent**: Add the shared contract for editing AI content (body-only), the response type for the update endpoint, and extend `AiContent` to include `deleted_at`.

**Contract**:
- Extend `AiContent` with `deleted_at: string | null` (ISO timestamp or null).
- Add `UpdateAiContentDTO { body: string }` — body is required (not optional like notes' content), since it's the only editable field; trimmed non-empty.
- Add `UpdateAiContentResponse { aiContent: AiContentWithTag }` — returns the updated row with tag name for display.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push`
- TypeScript compiles: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Verify via Supabase Studio that `ai_content` has the `deleted_at` column (nullable, timestamptz)
- Verify existing digests have `deleted_at = NULL`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Service + API

### Overview

Add generic `updateAiContent` and `softDeleteAiContent` service functions, a validation schema, and a new `PATCH`/`DELETE` route at `/api/ai-content/[id]`. Update `listDigests` to exclude soft-deleted rows.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/validation/digest.ts`

**Intent**: Single source of truth for validating the PATCH body of ai_content edits.

**Contract**: Export `updateAiContentSchema` validating `{ body: string }` — trimmed, min 1 character (non-empty). Export the inferred type or reuse `UpdateAiContentDTO`.

#### 2. Service: updateAiContent

**File**: `src/lib/services/digest.ts`

**Intent**: Generic body-only update for any `ai_content` row the user owns, with ownership gate → null return (route maps to 404). Follows the same gate-then-mutate pattern as `updateNoteWithTags` in `notes.ts`.

**Contract**: `updateAiContent(supabase, userId, id, { body }): Promise<AiContentWithTag | null>`. Gate on ownership: `SELECT` the row by `(id, user_id, deleted_at IS NULL)` — if no row, return `null`. Update `body` via `UPDATE ai_content SET body = ... WHERE id AND user_id`. Do not set `updated_at` (trigger owns it). Re-read with the tag join (same shape as `listDigests`) and return the `AiContentWithTag`. The function is generic — it operates on any `ai_content` kind (digest or weekly).

#### 3. Service: softDeleteAiContent

**File**: `src/lib/services/digest.ts`

**Intent**: Soft-delete any `ai_content` row the user owns by setting `deleted_at = now()`. Returns a boolean indicating whether a row was affected (route → 404 on false).

**Contract**: `softDeleteAiContent(supabase, userId, id): Promise<boolean>`. Execute `UPDATE ai_content SET deleted_at = now() WHERE id = X AND user_id = Y AND deleted_at IS NULL`; return `true` if a row was affected, `false` otherwise. The `set_updated_at` trigger also fires (acceptable — `updated_at` on deleted rows isn't displayed).

#### 4. Update listDigests to exclude soft-deleted

**File**: `src/lib/services/digest.ts`

**Intent**: Ensure the `/ai` page and `GET /api/digests` don't show soft-deleted items.

**Contract**: Add `.is("deleted_at", null)` to the existing query in `listDigests`. No other changes — the function signature and return type are unchanged.

#### 5. API route: PATCH + DELETE ai-content by id

**File**: `src/pages/api/ai-content/[id].ts` (new)

**Intent**: Expose edit and soft-delete for any ai_content item the user owns. Generic route path (`/api/ai-content/[id]`) rather than `/api/digests/[id]` since the service is kind-agnostic; S-08 weekly summaries reuse this route.

**Contract**: `export const prerender = false;`. Both handlers: auth guard (→ 401), Supabase client (→ 500), UUID param validation (→ 404), try/catch with `json({ error }, 500)` (lessons.md). Use `json()` from `@/lib/http`.
- `PATCH`: parse JSON body (→ 400), validate with `updateAiContentSchema` (→ 400 with issues), call `updateAiContent`; `null` → 404; else 200 with `UpdateAiContentResponse`.
- `DELETE`: call `softDeleteAiContent`; `false` → 404; `true` → 200 with `{ id }`.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Linting passes: `npm run lint`
- Route exports `const prerender = false`

#### Manual Verification:

- `PATCH /api/ai-content/:id` with `{ body: "edited text" }` returns 200 with updated `body` and bumped `updated_at`
- `PATCH` with empty/whitespace body returns 400
- `PATCH`/`DELETE` on another user's ai_content returns 404
- `DELETE /api/ai-content/:id` returns 200 `{ id }`; the digest no longer appears in `GET /api/digests` but the row persists in DB with `deleted_at` set
- `DELETE` on already-deleted item returns 404
- Unauthenticated `PATCH`/`DELETE` returns 401

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the API behavior (auth, ownership isolation, soft-delete persistence) was verified before proceeding to the next phase.

---

## Phase 3: Frontend

### Overview

Add a `useDigests` hook for client-side state management, extract a `DigestItem` component with inline edit + AlertDialog delete + "edited" indicator, and wire everything into `DigestList` and `ai.astro`.

### Changes Required:

#### 1. Extract `readApiError` to shared module

**File**: `src/lib/api-client.ts` (new)

**Intent**: Hoist the `readApiError` helper out of `useNotes.ts` into a shared module so both `useNotes` and `useDigests` import a single implementation (lessons.md: "Hoist shared API helpers… don't copy-paste").

**Contract**: Export `readApiError(res: Response, fallback: string): Promise<string>` — same 5-line implementation currently in `src/components/hooks/useNotes.ts:4-10`. Update `useNotes.ts` to import from `@/lib/api-client` and remove its local copy.

#### 2. Client state hook

**File**: `src/components/hooks/useDigests.ts` (new)

**Intent**: Manage digests client state (initialized from SSR data) with await-then-update mutations, mirroring `useNotes` in `src/components/hooks/useNotes.ts`.

**Contract**: `useDigests(initialDigests: AiContentWithTag[])` returns `{ digests, updateDigest, deleteDigest }`.
- `updateDigest(id, body): Promise<AiContentWithTag>` — `PATCH /api/ai-content/:id` with `{ body }`; on success replace the matching digest in state (by id, preserving order); on error throw with the server's error message (import `readApiError` from `@/lib/api-client`).
- `deleteDigest(id): Promise<void>` — `DELETE /api/ai-content/:id`; on success remove the digest from state; on error throw.

#### 3. Digest item component

**File**: `src/components/ai/DigestItem.tsx` (new)

**Intent**: Render a single digest card with view mode (tag badge, date, "edited" indicator, body, Edit/Delete buttons) and edit mode (textarea + Save/Cancel). Delete via AlertDialog. Mirrors `NoteItem.tsx` structure, simplified (body-only edit, no tag re-sync).

**Contract**: Props: `digest: AiContentWithTag`, `onUpdate(id: string, body: string): Promise<AiContentWithTag>`, `onDelete(id: string): Promise<void>`.
- View mode: tag badge, formatted date, "edited" indicator when `digest.updated_at > digest.created_at` (compare ISO strings — monotonic), body (whitespace-pre-wrap), Edit (Pencil) + Delete (Trash2) icon buttons.
- Edit mode: local `isEditing` state; textarea seeded with `digest.body`; Save disabled while trimmed content empty; on Save call `onUpdate`, exit edit on success; on error show message via `ServerError`. Cancel restores original and exits.
- Delete: AlertDialog ("Delete this digest? This can't be undone."); confirm calls `onDelete`; disable confirm button while in-flight. Ref guards against double-submit (same pattern as NoteItem).
- Use `cn()` for conditional styling, `lucide-react` icons, existing `Button` and `AlertDialog` from `src/components/ui/`.

#### 4. Update DigestList to use hook and DigestItem

**File**: `src/components/ai/DigestList.tsx`

**Intent**: Replace the static read-only list with the `useDigests` hook and `DigestItem` components, enabling instant client-side updates after edit/delete.

**Contract**: `DigestList` props unchanged (`initialDigests: AiContentWithTag[]`). Internally: call `useDigests(initialDigests)` to get `{ digests, updateDigest, deleteDigest }`. Render `digests` (not `initialDigests`) as `<DigestItem>` elements, passing `onUpdate={updateDigest}` and `onDelete={deleteDigest}`. The empty state and overall list structure remain the same.

#### 5. Pass the hook through ai.astro

**File**: `src/pages/ai.astro`

**Intent**: No changes needed — `ai.astro` already passes `initialDigests` to `DigestList` with `client:load`. The hook hydrates from the same prop.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- On `/ai`, each digest card shows Edit (pencil) and Delete (trash) icon buttons
- Clicking Edit turns the card body into a textarea seeded with the current body; Save disabled when content is blanked
- Editing body and saving replaces the card in place with updated text; "edited" indicator appears next to the date
- Cancel discards changes and returns to view mode
- Clicking Delete opens AlertDialog; confirming removes the card from the list instantly; the digest is gone after page reload
- Deleting a digest doesn't affect other digests in the list
- "Edited" indicator is shown only on digests where `updated_at > created_at`, not on freshly generated ones
- Empty state renders correctly when all digests are deleted
- Signed-out access to `/ai` redirects to sign-in
- A second user cannot edit/delete the first user's digests (API → 404)

**Implementation Note**: After completing this phase, pause for manual confirmation of the full edit + delete loop, the "edited" indicator, and the isolation spot-check before considering the slice done.

---

## Testing Strategy

### Unit Tests:

- No test runner configured (AGENTS.md). Correctness verified via lint + build + manual walkthrough.

### Integration Tests:

- Manual API-level checks: PATCH body, PATCH empty → 400, PATCH/DELETE non-owned → 404, DELETE soft-deletes (row persists with `deleted_at`), DELETE already-deleted → 404, unauthenticated → 401.

### Manual Testing Steps:

1. Run `npm run dev`, sign in, visit `/ai` with at least one existing digest
2. Edit a digest's body; confirm the card updates in place and "edited" indicator appears
3. Blank the body in edit mode; confirm Save is disabled
4. Cancel an edit; confirm no change persisted
5. Delete a digest; confirm the dialog appears, confirming removes it instantly, gone after reload
6. Check the DB directly — the deleted row should have `deleted_at` set, not be physically deleted
7. Generate a new digest from `/notes`; confirm it appears on `/ai` without "edited" indicator
8. As a second user, `PATCH`/`DELETE` the first user's digest via curl; confirm 404
9. Hit `/ai` signed out; confirm redirect to `/auth/signin`

## Performance Considerations

MVP scale is small. Edit touches one row (`UPDATE body`); soft-delete touches one row (`UPDATE deleted_at`). The `useDigests` state update is O(n) over a small list. The `deleted_at IS NULL` filter in `listDigests` adds negligible cost to an already-indexed query. No pagination needed at MVP scale.

## Migration Notes

- Small additive migration: one nullable column (`deleted_at`) on `ai_content`. No default backfill needed — existing rows correctly have `NULL` (not deleted).
- No RLS changes — existing policies are unaffected.
- The `set_updated_at` trigger fires on soft-delete (it's an UPDATE), but since deleted items are filtered from the UI, this has no visible impact.
- `fetchLastDigestForTag` (digest watermark) is NOT modified — soft-deleted digests still count as watermarks, preventing re-digesting the same notes after a rejection.

## References

- Roadmap S-06: `context/foundation/roadmap.md` lines 160-170
- PRD FR-017: `context/foundation/prd.md` lines 117-120
- S-02 plan (digest creation): `context/archive/2026-08-27-first-ai-digest-on-click/plan.md`
- S-03 plan (inline edit pattern): `context/archive/2026-08-26-inline-edit-and-delete-note/plan.md`
- ai_content migration: `supabase/migrations/20260827203449_ai_content_table.sql`
- Digest service: `src/lib/services/digest.ts`
- Notes API pattern: `src/pages/api/notes/[id].ts`
- useNotes hook pattern: `src/components/hooks/useNotes.ts`
- NoteItem edit/delete pattern: `src/components/notes/NoteItem.tsx`
- DigestList (target): `src/components/ai/DigestList.tsx`
- Shared types: `src/types.ts`
- Lessons (JSON envelope, log-before-degrade): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Layer + Types

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push` — 0b371c3
- [x] 1.2 TypeScript compiles: `npm run build` — 0b371c3
- [x] 1.3 Linting passes: `npm run lint` — 0b371c3

#### Manual

- [x] 1.4 Verify `deleted_at` column exists (nullable, timestamptz) and existing digests have `deleted_at = NULL` — 0b371c3

### Phase 2: Service + API

#### Automated

- [x] 2.1 TypeScript compiles: `npm run build` — e5566b3
- [x] 2.2 Linting passes: `npm run lint` — e5566b3
- [x] 2.3 Route exports `const prerender = false` — e5566b3

#### Manual

- [x] 2.4 PATCH body-only returns 200 with updated body and bumped `updated_at` — e5566b3
- [x] 2.5 PATCH empty/whitespace body returns 400 — e5566b3
- [x] 2.6 PATCH/DELETE on another user's ai_content returns 404 — e5566b3
- [x] 2.7 DELETE returns 200 `{ id }`; digest gone from GET /api/digests; row persists in DB with `deleted_at` set — e5566b3
- [x] 2.8 DELETE on already-deleted item returns 404 — e5566b3
- [x] 2.9 Unauthenticated PATCH/DELETE returns 401 — e5566b3

### Phase 3: Frontend

#### Automated

- [x] 3.1 TypeScript compiles: `npm run build` — 1ab6f8f
- [x] 3.2 Linting passes: `npm run lint` — 1ab6f8f

#### Manual

- [x] 3.3 Each digest card shows Edit + Delete controls; list unchanged at rest — 1ab6f8f
- [x] 3.4 Edit opens textarea seeded with body; Save disabled when content blank — 1ab6f8f
- [x] 3.5 Editing body and saving replaces card in place; "edited" indicator appears — 1ab6f8f
- [x] 3.6 Cancel discards changes and returns to view mode — 1ab6f8f
- [x] 3.7 Delete opens AlertDialog; confirm removes card instantly; gone after reload; DB row has `deleted_at` set — 1ab6f8f
- [x] 3.8 "Edited" indicator only on digests where `updated_at > created_at` — 1ab6f8f
- [x] 3.9 Empty state renders when all digests deleted — 1ab6f8f
- [x] 3.10 Signed-out `/ai` redirects; second user cannot edit/delete first user's digests (404) — 1ab6f8f
