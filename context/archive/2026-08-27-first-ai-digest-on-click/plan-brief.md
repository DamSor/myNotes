# First AI Digest on Click — Plan Brief

> Full plan: `context/changes/first-ai-digest-on-click/plan.md`

## What & Why

We're building the NORTH STAR slice of MyNotes: a user clicks "Generate digest" for a selected tag, the system summarizes their notes using AI, and the result appears in a dedicated "AI for me" section. This proves the core product hypothesis — that AI-powered return-to-notes creates value users accept (≥70% implicit acceptance target).

## Starting Point

The notes CRUD system is complete (create, list, edit, delete, tag, filter, search). The LLM integration contract is settled (`chatCompletion` in `src/lib/services/llm.ts` with OpenRouter, training opt-out enforced). What's missing is the bridge: no AI content storage, no digest generation logic, no "AI for me" UI surface.

## Desired End State

A user on `/notes` filters by a tag, clicks "Generate digest," sees immediate spinner feedback, and moments later can view a structured AI summary (themes, decisions, open threads, contradictions) on a new `/ai` page. Digests are grounded exclusively in the user's own notes — no hallucinated content. Subsequent digests for the same tag only process notes created after the previous one.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| UI placement for "AI for me" | Separate `/ai` page | Keeps the notes list focused on user-content; AI-content gets its own dedicated view. |
| Digest trigger UX | Button in tag filter bar (visible when tag active) | Natural integration point — user is already in "this tag's context" when filtering. |
| Progress feedback | Inline spinner on button + skeleton card | Meets NFR (≤2s without signal) without streaming complexity. |
| Note selection window | Since last digest for that tag (all if first) | Matches FR-015 exactly; prevents duplicate content across digests. |
| Digest structure | Themes / Key decisions / Open threads / Contradictions | Maximizes actionable value from notes; enforces grounding via structured prompt. |
| Error handling | Inline error + "Try again" button | User gets clear feedback and easy retry without page reload. |
| Data model | Minimal ai_content (id, user_id, source_tag_id, kind, body, timestamps) | Simplest correct schema; usage metadata deferred (no monitoring need yet). |

## Scope

**In scope:**
- `ai_content` table with RLS (kind: digest/weekly for future S-08)
- Digest generation service with grounding-enforcing prompt
- POST /api/digests (generate) and GET /api/digests (list) endpoints
- "Generate digest" button on `/notes` tag filter bar
- New `/ai` page showing digest history
- Navigation link to "AI for me"
- Error and empty states
- Prompt-size safeguard (truncate if notes exceed ~50k chars)

**Out of scope:**
- Inline edit/delete of digests (S-06)
- Weekly summaries (S-08)
- Streaming/SSE
- Multi-model fallback
- `ai_run_failures` table (parked)
- Pagination

## Architecture / Approach

```
[/notes page] → "Generate digest" button (when tag selected)
       ↓ POST /api/digests { tagId }
[API route] → validate (zod) → [digest service]
       ↓ fetch notes since last digest for tag
       ↓ construct grounded prompt
       ↓ chatCompletion (LLM)
       ↓ insert into ai_content
       ↓ return new digest
[client] → redirect to /ai

[/ai page] → server-fetch listDigests → [DigestList island]
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data Layer | `ai_content` table + RLS + types | Low — follows established migration pattern |
| 2. Service & API | Digest generation logic + endpoints | Prompt quality (grounding enforcement) |
| 3. Frontend | "Generate digest" button + /ai page | UX polish; error state completeness |

**Prerequisites:** S-01 done (notes exist), F-02 done (LLM configured), local Supabase running for migration testing.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- Prompt quality is untested until Phase 2 manual verification — the first iteration may need tuning to reliably produce grounded, structured output
- Claude Haiku context window must fit all qualifying notes for a tag; safeguard truncation at ~50k chars mitigates but may lose oldest context
- Cloudflare Workers 10ms CPU cap is unlikely to be hit (single user, single JSON parse) but is a known platform constraint

## Success Criteria (Summary)

- User can generate a grounded AI digest for any tag with a single click
- Digest body contains only themes/decisions/threads from the user's actual notes (zero hallucination)
- The full flow (click → spinner → digest visible on /ai) completes without visible stall >2s
