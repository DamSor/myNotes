# Text Search Implementation Plan

## Overview

Add a search input to the notes page that instantly filters the list by case-insensitive substring match on note content. The search composes with the existing tag filter via AND logic (both narrow together). This is a pure client-side feature — no API or data model changes required.

## Current State Analysis

The notes page (`src/pages/notes.astro`) server-fetches all notes and passes them to the `NoteCapture` React island. Inside `NoteCapture` (`src/components/notes/NoteCapture.tsx`), all filtering is client-side:

- `notes` state holds the full set (managed by `useNotes` hook)
- `activeTagId` state drives tag filtering
- `filteredNotes` is derived via `useMemo` from `notes` + `activeTagId` (line 31-34)
- The flat list renders `filteredNotes` as `<NoteItem>` components

The tag filter is implemented as a row of pill buttons below the capture form. There is no search input today.

## Desired End State

A search input field appears between the capture form and the tag filter chips. Typing instantly narrows the notes list to those whose `content` contains the typed text (case-insensitive substring). When a tag is also active, both filters apply together (AND). Clearing the search input restores the full (or tag-filtered) list.

Verification: type a word that appears in some notes but not others — only matching notes show. Activate a tag alongside the search — only notes matching both show. Clear search — tag filter still active. Clear tag — search still active.

### Key Discoveries:

- Tag filtering is purely client-side via `useMemo` in `NoteCapture.tsx:31-34`
- All notes are in memory (MVP scale, single user, small data) — no need for server-side search
- The component already handles an empty-state message for filtered results (`NoteCapture.tsx:148`)
- The `cn()` helper from `@/lib/utils` is used throughout for conditional Tailwind classes

## What We're NOT Doing

- No server-side `ILIKE` query or full-text search index — MVP scale doesn't warrant it
- No search highlighting of matched substrings in note items
- No debouncing — client-side array filter is instant
- No search across tag names — only note content is searched
- No persistent search state (URL params, localStorage) — ephemeral like the tag filter

## Implementation Approach

Extend the existing `NoteCapture` component with a `searchQuery` state variable and update the `filteredNotes` memo to apply both filters. Add a search input UI element above the tag chips. Reuse existing styling patterns (glassmorphism inputs, Tailwind classes, `cn()` helper).

## Phase 1: Search UI and Client-Side Filter

### Overview

Add the search input, wire up the filtering logic, and handle combined empty states.

### Changes Required:

#### 1. NoteCapture component — search state and filter logic

**File**: `src/components/notes/NoteCapture.tsx`

**Intent**: Add a `searchQuery` state variable and extend the `filteredNotes` memo to also check whether `note.content.toLowerCase()` includes `searchQuery.toLowerCase()`. Both the tag filter and the text filter apply together (AND composition). Clear `searchQuery` on successful note creation (alongside the existing `setActiveTagId(null)`) so newly created notes are immediately visible.

**Contract**: The `filteredNotes` memo gains a second dependency (`searchQuery`) and an additional `.filter()` predicate. The search is case-insensitive substring via `String.prototype.includes()`. The `handleSubmit` success path resets `searchQuery` to `""`.

#### 2. NoteCapture component — search input UI

**File**: `src/components/notes/NoteCapture.tsx`

**Intent**: Render a search input between the capture form and the tag filter chips. Include a clear button (X icon) when the query is non-empty, following the same `lucide-react` icon pattern used by the tag filter's clear button.

**Contract**: A new `<div>` block rendered after the `<form>` and before the tag chips `{tags.length > 0 && ...}` block. The input uses the same glassmorphism styling as the textarea (`border-white/20 bg-white/10 text-white placeholder-white/40`). The `Search` icon from `lucide-react` decorates the left side; the `X` icon clears the input on click.

#### 3. NoteCapture component — empty state messaging

**File**: `src/components/notes/NoteCapture.tsx`

**Intent**: Update the empty-state conditional to distinguish between "no notes with this tag" and "no notes matching search" so the user gets a relevant message.

**Contract**: The existing ternary at line 145-149 is extended. When `searchQuery` is non-empty and `filteredNotes` is empty, show a message like "No notes matching your search." When both tag and search are active and produce no results, same message applies (the AND composition means both contributed to the empty set).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No TypeScript errors in modified file

#### Manual Verification:

- Search input appears between the form and tag chips with consistent styling
- Typing a substring filters notes instantly
- Search + tag filter work together (AND)
- Clearing search restores the full/tag-filtered list
- Empty state shows appropriate message
- Clear button (X) appears only when query is non-empty and works correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

No test runner is configured. Verification relies on automated (lint, build, typecheck) and manual testing.

### Manual Testing Steps:

1. Navigate to `/notes` with several notes containing different words
2. Type a word present in some notes — list narrows correctly
3. Type a word present in no notes — empty state message shown
4. Select a tag, then type a search — both filters compose (AND)
5. Clear search via X button — tag filter still active, all tagged notes show
6. Clear tag filter — search still active, search results from all notes show
7. Search is case-insensitive: "Hello" matches "hello world"
8. Substring match: "ell" matches "Hello"
9. Empty search input shows all notes (or tag-filtered set)

## Performance Considerations

None. Client-side `Array.filter` + `String.includes` on small data (<100 notes for a single MVP user) is instant. No debounce needed.

## References

- PRD FR-020: `context/foundation/prd.md`
- Roadmap S-05: `context/foundation/roadmap.md`
- Related S-04 (single-tag-filter): tag filtering pattern in `src/components/notes/NoteCapture.tsx:31-34`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Search UI and Client-Side Filter

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — adf5e7e
- [x] 1.2 Build succeeds: `npm run build` — adf5e7e
- [x] 1.3 No TypeScript errors in modified file — adf5e7e

#### Manual

- [x] 1.4 Search input appears between the form and tag chips with consistent styling — adf5e7e
- [x] 1.5 Typing a substring filters notes instantly — adf5e7e
- [x] 1.6 Search + tag filter work together (AND) — adf5e7e
- [x] 1.7 Clearing search restores the full/tag-filtered list — adf5e7e
- [x] 1.8 Empty state shows appropriate message — adf5e7e
- [x] 1.9 Clear button (X) appears only when query is non-empty and works correctly — adf5e7e
