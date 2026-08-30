# Edit or Delete Digest — Plan Brief

> Full plan: `context/changes/edit-or-delete-digest/plan.md`

## What & Why

Enable inline editing and soft-deletion of AI digests in the "AI for me" section, so the 70% acceptance metric (Primary Success Criterion) has the signals it needs: edited = accepted, deleted = rejected, no action = implicit accept. Without this slice, the metric is unmeasurable and the core product hypothesis unverifiable.

## Starting Point

S-02 shipped the `ai_content` table (with UPDATE/DELETE RLS ready), digest generation, and a read-only `DigestList` on `/ai`. S-03 established the inline-edit + AlertDialog-delete pattern for notes across service → API → React island layers. The digest UI currently has no edit/delete controls and no client-state hook.

## Desired End State

On `/ai`, each digest card has Edit and Delete controls. Editing opens the body in a textarea with Save/Cancel and shows an "edited" indicator on save. Deleting soft-deletes the row (preserving it for metric queries) and removes the card instantly. The 70% metric is derivable from `deleted_at` (rejected) and `updated_at > created_at` (edited/accepted) on the existing `ai_content` table.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Delete model | Soft delete (`deleted_at` column) | Preserves the rejection signal for the 70% metric — hard delete loses it permanently. | Plan |
| Client state management | `useDigests` hook (await-then-update) | Instant UI updates consistent with S-03's `useNotes` pattern; avoids full-page reloads. | Plan |
| Service scope | Generic over all `ai_content` kinds | Minimal extra work; S-08 weekly summaries get edit/delete for free without re-implementing. | Plan |
| Edit indicator | Show "edited" when `updated_at > created_at` | Makes the acceptance signal visible to the user, leveraging the existing DB trigger. | Plan |
| API route path | `/api/ai-content/[id]` (generic) | Honest about kind-agnostic service; digest-specific ops stay at `/api/digests`. | Plan |
| Watermark after delete | Unchanged (soft-deleted digests count) | Prevents re-digesting the same notes after rejection — safer default for MVP. | Plan |

## Scope

**In scope:**
- Migration: `deleted_at` column on `ai_content`
- Service: generic `updateAiContent` + `softDeleteAiContent`
- API: `PATCH`/`DELETE` on `/api/ai-content/[id]`
- Validation: `updateAiContentSchema` (body required, trimmed non-empty)
- Hook: `useDigests` with await-then-update pattern
- UI: `DigestItem` with inline edit, AlertDialog delete, "edited" indicator
- Filter soft-deleted rows from `listDigests`

**Out of scope:**
- Acceptance metric dashboard/aggregation UI
- Weekly summary edit/delete UI (service ready, no UI until S-08)
- Re-generation after deletion
- Source tag editing on digests
- Optimistic UI / rollback
- Automated tests

## Architecture / Approach

Three-layer vertical slice mirroring S-03, simplified (body-only edit, no tag re-sync):

```
Migration (deleted_at) → Types (UpdateAiContentDTO)
    → Service (updateAiContent, softDeleteAiContent) + Validation
        → API (/api/ai-content/[id] — PATCH, DELETE)
            → useDigests hook → DigestItem component → DigestList wiring
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data Layer + Types | `deleted_at` column + DTO types | Migration must not break existing digest queries |
| 2. Service + API | Generic edit/delete + validation + `/api/ai-content/[id]` | Ownership gate must return 404, not leak data |
| 3. Frontend | `useDigests` hook + `DigestItem` + "edited" indicator | Must mirror S-03 UX exactly (await-then-update, AlertDialog) |

**Prerequisites:** S-02 done (ai_content table + DigestList exist), AlertDialog installed (S-03).
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Metric 70% at small N (1 user × ~10 digests) will be noisy — accepted under speed bias (roadmap S-06 risk)
- "Edited" = any body change (typo fix or full rewrite); no distinction in MVP — PRD OQ#5 defers granular definition
- `set_updated_at` trigger fires on soft-delete UPDATE — acceptable since deleted items are filtered from UI

## Success Criteria (Summary)

- User can edit a digest body inline and see an "edited" indicator after saving
- User can soft-delete a digest via confirmation dialog; it disappears from the UI but persists in the DB with `deleted_at` set
- The 70% acceptance metric signals (edit / no-op / delete) are derivable from `updated_at` and `deleted_at` columns
