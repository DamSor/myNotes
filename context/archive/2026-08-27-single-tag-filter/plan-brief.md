# Single-Tag Filter — Plan Brief

> Full plan: `context/changes/single-tag-filter/plan.md`

## What & Why

Add a single-tag filter to the notes list so users can narrow their view to notes tagged with a specific label. FR-011 requires this as a must-have — without it, the flat notes list becomes unwieldy as the note count grows. Multi-tag (AND/OR) is explicitly deferred to v2.

## Starting Point

The `/notes` page renders all user notes in a flat newest-first list via the `NoteCapture` React island. Tags appear as static purple pill chips on each note. All notes and tags are already loaded client-side (SSR-seeded into `useNotes` state). No filtering, search, or tag interaction exists today.

## Desired End State

A horizontal pill bar sits between the capture form and the notes list, showing "All" + one pill per user tag. Clicking a pill filters the list instantly (client-side). Clicking a tag chip on any note does the same. The active pill shows × to clear. Creating a new note resets the filter so the new note is always visible.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Filter approach | Client-side (derive from in-memory array) | Data scale is small; avoids API changes and gives instant UX |
| Filter UI placement | Horizontal pill bar between form and list | Natural reading flow — user sees tags before scanning the list |
| Tag chip interaction | Clickable — activates filter | Quick "show me more like this" gesture reduces clicks |
| Clear filter mechanism | "All" pill + × on active pill | Two affordances cover both discovery and muscle-memory users |
| New note + active filter | Clear filter on creation | Guarantees the new note is visible; avoids confusion |

## Scope

**In scope:**
- `activeTagId` filter state in `NoteCapture`
- Derived `filteredNotes` array with `useMemo`
- Pill bar UI (All + per-tag pills with active/inactive styling)
- × button on active pill to clear
- Clickable tag chips on `NoteItem` with hover affordance
- Clear filter on note creation
- Filtered empty state message

**Out of scope:**
- Multi-tag filter (AND/OR) — v2
- Server-side filtering / API query params
- URL-based filter state (deep-linking)
- Text search (S-05)
- Database changes

## Architecture / Approach

Pure client-side: one `activeTagId: string | null` state in `NoteCapture`, a `useMemo`-derived `filteredNotes` array, and a pill bar rendered between the form and list. `NoteItem` gets an `onTagClick` prop that makes tag chips clickable. No service, API, or schema changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Filter State and Pill Bar | Filter state, derived list, pill bar UI, clear-on-create | Pill bar overflow on many tags (mitigated by `flex-wrap`) |
| 2. Clickable Tag Chips | Tag chips on notes become clickable filter triggers | Semantic change from `<li>` to `<button>` could affect styling |

**Prerequisites:** S-01 done (notes + tags exist in the UI).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Pill bar wraps gracefully with `flex-wrap` when the user has many tags; at extreme counts (50+) scrolling may be needed — acceptable for MVP, revisit if feedback signals it.
- Client-side filter is O(n×m) per render — negligible at MVP scale (tens to low hundreds of notes).

## Success Criteria (Summary)

- User can select a tag pill and see only matching notes instantly
- User can clear the filter via "All" pill or × button
- Clicking a tag chip on a note activates the filter for that tag
