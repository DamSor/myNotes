# Text Search — Plan Brief

> Full plan: `context/changes/text-search/plan.md`

## What & Why

Add text search to the notes list so users can find notes by typing a fragment of their content. Without this, the flat list becomes unusable after the first week of use (PRD FR-020, documented insight from Socratic FR-005).

## Starting Point

The notes page loads all notes client-side and filters them by tag via a `useMemo` in `NoteCapture.tsx`. There is no search input today — the only way to find a specific note is to scroll or filter by tag.

## Desired End State

A search input sits above the tag filter chips. Typing instantly narrows the list to notes whose content contains the typed text (case-insensitive substring). The search composes with the tag filter via AND — both narrow together.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Server vs client filtering | Client-side | All notes are already in memory; MVP scale (small data) makes server-side search unnecessary overhead. |
| Search + tag interaction | AND composition | Both filters narrow together — most intuitive behavior, matches how users expect combined filters to work. |
| Filtering trigger | Instant (keystroke) | Client-side array filter is instant; debouncing adds code for no perceived benefit. |
| Match highlighting | No | Keeps implementation simple; the filter itself proves the match. |
| Search input placement | Above tag chips | Follows visual hierarchy: search is broader (content), tags are narrower (category). |

## Scope

**In scope:**
- Search input with clear button above tag chips
- Case-insensitive substring filter on note content
- AND composition with existing tag filter
- Appropriate empty-state messaging

**Out of scope:**
- Server-side search (ILIKE, tsvector)
- Search highlighting
- Searching tag names
- Persistent search state (URL params)
- Debouncing

## Architecture / Approach

Pure client-side — a new `searchQuery` state in `NoteCapture` extends the existing `filteredNotes` memo with a second predicate (`note.content.toLowerCase().includes(query)`). No API changes, no new endpoints, no data model changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Search UI and Client-Side Filter | Working search input with instant filtering | None significant — single component change following established pattern |

**Prerequisites:** S-01 done (notes exist to search).
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- Assumes MVP user has <100 notes — client-side filter remains instant. If data grows significantly, server-side search would be needed (deferred to post-MVP).

## Success Criteria (Summary)

- User can type a text fragment and the list immediately narrows to matching notes
- Search and tag filter work together (AND)
- Empty-state messaging is clear when no notes match
