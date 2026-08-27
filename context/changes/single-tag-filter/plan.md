# Single-Tag Filter Implementation Plan

## Overview

Add a client-side single-tag filter to the notes list at `/notes`. A horizontal pill bar between the capture form and the list lets the user select one tag to narrow the view; clicking a tag chip on any note does the same. Selecting a different tag replaces the active filter. An "All" pill and a × on the active pill provide two ways to clear. FR-011 only; multi-tag AND/OR is explicitly out of scope (v2).

## Current State Analysis

The notes page (`src/pages/notes.astro`) SSR-fetches all user notes and tags via `listNotesWithTags` / `listTags` and passes them as `initialNotes` / `initialTags` to the `NoteCapture` React island. The island owns all list markup through `useNotes` (client state) and `NoteItem` (per-row rendering). Tags render as static purple pill chips in each `NoteItem` — not clickable. No filtering or search UI exists.

### Key Discoveries:

- `useNotes` hook (`src/components/hooks/useNotes.ts`) exposes `notes: NoteWithTags[]` and `tags: Tag[]` — both already in-memory. Filter is derivable without API calls.
- `NoteItem` (`src/components/notes/NoteItem.tsx`, lines 223–234) renders tags as `<li>` elements with purple pill styling (`rounded-full border-purple-400/40 bg-purple-500/20`). These become clickable in Phase 2.
- DB index `note_tags_tag_id_idx` exists (migration `20260819205610`, line 74) but is unused — stays unused since this is client-side.
- Data scale is `small` (PRD `target_scale`); all notes fit in-memory comfortably.

## Desired End State

The `/notes` page shows a horizontal pill bar between the capture form and the notes list. The bar starts with an "All" pill followed by one pill per tag the user owns (ordered alphabetically). Clicking a tag pill highlights it and the list shows only notes tagged with that tag. Clicking a different tag replaces the filter. The active pill shows a small × to clear. Clicking "All" also clears. Clicking a tag chip on any note in the list activates the filter for that tag. Creating a new note clears any active filter so the new note is always visible.

Verification: navigate to `/notes`, create several notes with different tags, click tag pills and tag chips to filter, confirm the list updates immediately, confirm "All" and × clear the filter, confirm creating a note resets the filter.

## What We're NOT Doing

- Multi-tag filter (AND/OR) — FR-011 explicit single-tag only; candidate for v2
- Server-side filtering / API query params — data scale is small; client-side is sufficient
- URL-based filter state (query params, hash) — no deep-linking requirement in FR-011
- Text search (S-05 `text-search`) — separate change
- New database migrations or indexes — existing schema supports this
- Tag management UI (rename, delete, merge tags)

## Implementation Approach

Pure client-side: add an `activeTagId: string | null` state to `NoteCapture`, derive a `filteredNotes` array from the existing `notes` array, and render a pill bar for tag selection. `NoteItem` gets an `onTagClick` callback to enable tag chips as filter triggers. No service, API, or schema changes required.

## Phase 1: Filter State and Pill Bar

### Overview

Add filter state to `NoteCapture`, derive the filtered notes list, render a horizontal pill bar between the capture form and the notes list, and clear the filter on note creation.

### Changes Required:

#### 1. NoteCapture — filter state, derived list, pill bar, clear-on-create

**File**: `src/components/notes/NoteCapture.tsx`

**Intent**: Introduce `activeTagId` state and a derived `filteredNotes` array. Render a pill bar ("`All`" + one pill per tag from `tags`, alphabetically) between the capture form and the note list. The active pill gets a highlighted style and a × button. Rendering switches from `notes.map(...)` to `filteredNotes.map(...)`. On successful note creation (`handleSubmit`), reset `activeTagId` to `null` so the new note is always visible in the full list.

**Contract**:
- `activeTagId: string | null` — `null` means "show all"
- `filteredNotes` derived via `useMemo`: when `activeTagId` is non-null, filter `notes` to those whose `tags` array contains a tag with that id; otherwise return `notes` unchanged
- Pill bar: a `<div>` with `flex flex-wrap gap-2` between the `</form>` and the `<ul>` / empty-state
- Each pill: `<button>` with tag name, using `cn()` to merge base pill styles with active/inactive variants. "All" pill is always first.
- Active pill includes a `<span>` with `×` (click stops propagation and sets `activeTagId` to `null`)
- `handleSubmit` success path: add `setActiveTagId(null)` after `setContent("")`
- Empty filtered state: when `filteredNotes` is empty but `notes` is not, show "No notes with this tag." instead of the create-first-note message

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No TypeScript errors in changed files

#### Manual Verification:

- Pill bar appears between capture form and notes list on `/notes`
- "All" is active by default and all notes are visible
- Clicking a tag pill filters the list to only notes with that tag
- Clicking a different tag replaces the filter
- Active pill shows × and clicking it clears the filter back to "All"
- Clicking "All" also clears the filter
- Creating a new note while a filter is active clears the filter
- When a filter is active and no notes match (edge case: tag exists but all its notes were deleted), the empty state says "No notes with this tag."
- Pill bar updates when tags are created through note creation (new tag appears as a pill)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Clickable Tag Chips in NoteItem

### Overview

Make tag chips in `NoteItem` read mode clickable, so clicking a tag on a note activates the filter for that tag — a quick "show me more like this" gesture.

### Changes Required:

#### 1. NoteItem — onTagClick prop and clickable chips

**File**: `src/components/notes/NoteItem.tsx`

**Intent**: Accept an optional `onTagClick` callback prop. In read mode, render tag chips as `<button>` elements (instead of `<li>`) with the existing purple pill styling plus `cursor-pointer` and a subtle hover effect. Clicking a chip calls `onTagClick(tag.id)`. In edit mode, tag chips are not rendered (the `TagInput` handles tags there), so no change needed.

**Contract**:
- New prop: `onTagClick?: (tagId: string) => void` added to `NoteItemProps`
- Tag list container stays `<ul>` but each chip becomes `<li>` wrapping a `<button>` (or `<button>` directly if the `<ul>` is swapped to a `<div>`)
- Hover style: `hover:bg-purple-500/30 hover:border-purple-400/60` (subtle brightening using `cn()`)
- When `onTagClick` is not provided, chips render without click behavior or hover style (defensive, though in practice it will always be passed)

#### 2. NoteCapture — wire onTagClick

**File**: `src/components/notes/NoteCapture.tsx`

**Intent**: Pass `setActiveTagId` as the `onTagClick` prop to each `NoteItem` so clicking a tag chip activates the filter.

**Contract**:
- `<NoteItem ... onTagClick={setActiveTagId} />` — the setter accepts a `string` which matches `onTagClick`'s `(tagId: string) => void` signature

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No TypeScript errors in changed files

#### Manual Verification:

- Tag chips on notes show pointer cursor and subtle hover effect
- Clicking a tag chip on a note filters the list to that tag (pill bar reflects the selection)
- Clicking a tag chip while another filter is active replaces the filter
- Tag chips in edit mode are unaffected (still managed by TagInput)
- Chips without `onTagClick` render normally (no errors if prop is omitted)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

No test runner is configured in this project. Skip.

### Manual Testing Steps:

1. Navigate to `/notes` — verify pill bar appears with "All" active and full notes list visible
2. Create 3+ notes with different tags (e.g., "work", "ideas", "reading")
3. Click the "work" pill — verify only notes tagged "work" appear
4. Click the "ideas" pill — verify filter switches to "ideas" notes only
5. Click × on the active pill — verify filter clears and all notes show
6. Click "All" pill — verify same clearing behavior
7. While "work" filter is active, create a new note — verify filter clears and the new note is visible at the top
8. Click a tag chip on a note in the list — verify the filter activates for that tag
9. Create a note with a new tag — verify the new tag appears as a pill in the bar
10. Filter to a tag, then delete all notes with that tag — verify "No notes with this tag." empty state
11. Test with a user who has no tags — verify pill bar shows only "All" (graceful empty state)

## Performance Considerations

Client-side filtering via `Array.filter` + `Array.some` on an in-memory array is O(n×m) where n=notes, m=tags-per-note. At MVP scale (tens to low hundreds of notes), this is negligible. `useMemo` with `[notes, activeTagId]` deps prevents recomputation on unrelated renders. No server round-trips on filter change — instant UX.

## References

- PRD FR-011: `context/foundation/prd.md` (line 101)
- Roadmap S-04: `context/foundation/roadmap.md` (lines 133–143)
- S-01 plan (conventions): `context/archive/2026-08-25-capture-note-with-tag/plan.md`
- S-03 plan (NoteItem patterns): `context/archive/2026-08-26-inline-edit-and-delete-note/plan.md`
- Lessons learned: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Filter State and Pill Bar

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Build succeeds: `npm run build`
- [x] 1.3 No TypeScript errors in changed files

#### Manual

- [ ] 1.4 Pill bar appears between capture form and notes list
- [ ] 1.5 Tag filtering works correctly (single-tag select/replace)
- [ ] 1.6 Clear filter works via "All" pill and × button
- [ ] 1.7 Creating a note clears the active filter
- [ ] 1.8 Empty filtered state shows appropriate message
- [ ] 1.9 New tag pills appear after note creation

### Phase 2: Clickable Tag Chips in NoteItem

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Build succeeds: `npm run build`
- [ ] 2.3 No TypeScript errors in changed files

#### Manual

- [ ] 2.4 Tag chips show pointer cursor and hover effect
- [ ] 2.5 Clicking a tag chip activates the filter for that tag
- [ ] 2.6 Tag chips in edit mode are unaffected
- [ ] 2.7 Chips render normally without onTagClick prop
