<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Inline Edit & Delete Note

- **Plan**: context/changes/inline-edit-and-delete-note/plan.md
- **Scope**: Phase 1–3 of 3 (full plan)
- **Date**: 2026-08-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Invalid UUID in route params returns 500 instead of 404

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/notes/[id].ts:17
- **Detail**: `context.params.id` is forwarded unsanitized to the service. An invalid UUID (e.g. `/api/notes/foo`) causes PostgREST to throw `22P02 invalid input syntax for type uuid`. The handler's catch maps this to a generic 500 `"Failed to update/delete note"`. The JSON error envelope is preserved (lesson 1 holds), but garbage IDs should fail as 404/400, not 500.
- **Fix**: Validate `id` with `z.uuid()` before the service call; on failure return `json({ error: "Note not found" }, 404)` so invalid, missing, and non-owned IDs share one response shape.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Validate dynamic route params before forwarding to the service layer

### F2 — Double-click race on Save and Delete

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/notes/NoteItem.tsx:68
- **Detail**: `handleSave` and `handleConfirmDelete` guard with React state (`isSaving` / `isDeleting`), which only updates after a re-render. A double-click in the same tick starts two in-flight requests. Concurrent PATCHes can race the tag-link diff (unique `(note_id, tag_id)` collision → one path degrades to `tagsAttached: false`). Double DELETE: first succeeds 200, second gets 404 and flashes an error as the row unmounts.
- **Fix**: Add a `useRef` lock at the start of each handler (set synchronously, clear in `finally`). Keep the existing `disabled` button attributes as a secondary guard.
  - Strength: Closes the race window without React render timing; pattern used in production React forms widely.
  - Tradeoff: Adds a ref per handler — minor complexity.
  - Confidence: HIGH — the state-only guard is a known React pitfall.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — Delete error rendered behind dialog overlay

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/notes/NoteItem.tsx:144-160
- **Detail**: When `handleConfirmDelete` fails, the error is written to `ServerError` on the row beneath the AlertDialog overlay. The dialog stays open, so the error message is invisible until the user clicks Cancel. Low severity because delete failures are rare (only on network issues or server error).
- **Fix**: Either render the error inside `AlertDialogContent`, or close the dialog on failure so the row error becomes visible.
- **Decision**: FIXED (close dialog on failure)

### F4 — Roadmap S-03 left `in-progress` after full implementation

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md:36
- **Detail**: Close-out commit `e677680` stamped S-03 as `in-progress`, but all Progress checkboxes are `[x]` and `change.md` is `status: implemented`. S-01 was stamped `done` at close-out. Minor documentation inconsistency.
- **Fix**: Update roadmap S-03 status from `in-progress` to `done`.
- **Decision**: SKIPPED
