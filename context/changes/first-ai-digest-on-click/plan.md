# First AI Digest on Click — Implementation Plan

## Overview

Implement the end-to-end AI digest generation flow (S-02, NORTH STAR): user selects a tag on `/notes`, clicks "Generate digest," the backend fetches that tag's notes since the last digest, calls the LLM with a grounding-enforcing prompt, stores the result in `ai_content`, and the user views their digests on a dedicated `/ai` page. This slice proves the core product hypothesis — that AI-powered return-to-notes creates value users accept.

## Current State Analysis

The notes CRUD system is complete (S-01, S-03, S-04, S-05 all done). The LLM integration contract is settled (F-02 done). What's missing is the bridge between the two: no `ai_content` table, no digest generation service, no API endpoints for digests, and no "AI for me" UI.

### Key Discoveries:

- `src/lib/services/llm.ts:75` — `chatCompletion` is ready with 25s timeout, `data_collection: "deny"`, and Claude Haiku default model
- `src/components/notes/NoteCapture.tsx:27` — `activeTagId` state already tracks which tag is filtered; the "Generate digest" button hooks into this naturally
- `supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql:13` — `set_updated_at()` trigger function exists for reuse
- `src/middleware.ts:4` — `PROTECTED_ROUTES` array gates routes; `/ai` must be added
- `src/lib/http.ts` — shared `json()` helper for uniform API responses
- `src/lib/services/notes.ts:28` — `listNotesWithTags` pattern to follow for service structure

## Desired End State

A logged-in user on `/notes` filters by a tag and sees a "Generate digest" button. Clicking it shows an inline spinner; within seconds a new digest appears on the `/ai` page. The `/ai` page lists all past digests newest-first, each labelled with its source tag. The digest text contains themes, key decisions, open threads, and contradictions — all grounded exclusively in the user's notes. If notes are insufficient (0 notes since last digest), the system refuses to generate and tells the user why. If the LLM call fails, an inline error + "Try again" button is shown.

## What We're NOT Doing

- No streaming/SSE — spinner + skeleton is sufficient for MVP NFR (≤ 2s visible progress)
- No inline edit/delete of digests (that's S-06)
- No weekly summary generation (that's S-08)
- No `ai_run_failures` table (parked)
- No multi-model fallback (single model sufficient per roadmap unknowns)
- No digest pagination (MVP scale)

## Implementation Approach

Follow established patterns: Supabase migration → entity types → service function → thin API route → React hook → Astro page + island. The digest generation is a synchronous server action: client POSTs tag_id, server fetches notes + calls LLM + stores + returns the result. The `/ai` page is a new Astro route with a React island (`DigestList`) that server-fetches initial data and handles the loading/error states.

## Phase 1: Data Layer

### Overview

Create the `ai_content` table, add RLS policies, and define TypeScript types for the new entity.

### Changes Required:

#### 1. Supabase migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_ai_content_table.sql`

**Intent**: Establish the `ai_content` table that stores AI-generated digests (and later weekly summaries). Progressive disclosure from F-01 — this table was intentionally not created earlier.

**Contract**: Table `public.ai_content` with columns `id uuid PK`, `user_id uuid FK auth.users NOT NULL`, `source_tag_id uuid FK tags NULL`, `kind text NOT NULL CHECK (kind IN ('digest', 'weekly'))`, `body text NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`. RLS enabled with per-operation policies (select/insert/update/delete own). Reuse `set_updated_at()` trigger. Index on `(user_id, created_at DESC)` for newest-first listing and `(user_id, source_tag_id, kind, created_at DESC)` for "last digest for tag" lookups.

#### 2. Entity and DTO types

**File**: `src/types.ts`

**Intent**: Add `AiContent` entity interface and `CreateDigestDTO` for the API contract.

**Contract**: `AiContent { id: string; user_id: string; source_tag_id: string | null; kind: 'digest' | 'weekly'; body: string; created_at: string; updated_at: string; }` and `CreateDigestDTO { tagId: string; }`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db push`
- TypeScript compiles: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Verify via Supabase Studio that `ai_content` table exists with correct columns, indexes, and RLS policies enabled
- Verify RLS isolation by attempting cross-user read (should return 0 rows)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Service & API

### Overview

Build the digest generation service (note selection, prompt construction, LLM call, storage) and expose it through `POST /api/digests` (generate) and `GET /api/digests` (list).

### Changes Required:

#### 1. Digest service

**File**: `src/lib/services/digest.ts`

**Intent**: Encapsulate the full digest generation logic — determine which notes to include, construct a grounding-enforcing prompt, call the LLM, and persist the result. Keeps the API route thin per established pattern.

**Contract**:
- `generateDigest(supabase: SupabaseClient, userId: string, tagId: string): Promise<AiContent>` — fetches notes for the tag since the last digest (or all if first), refuses if 0 qualifying notes (throws descriptive error), builds the system+user prompt, calls `chatCompletion`, inserts into `ai_content`, returns the new row. Window filter uses `notes.created_at > last_digest.created_at` — edited notes are not re-digested (acceptable for MVP).
- Prompt-size safeguard: if concatenated note content exceeds 50k characters, truncate from oldest notes until it fits. Prepend a system-level note to the prompt indicating N oldest notes were omitted for length.
- `listDigests(supabase: SupabaseClient, userId: string): Promise<AiContentWithTag[]>` — newest-first list with the source tag name joined.
- The system prompt must enforce grounding: output based solely on provided notes, structured as Themes / Key decisions / Open threads / Contradictions (if any), and "brak materiału" when a section has no support.

#### 2. Validation schema

**File**: `src/lib/validation/digest.ts`

**Intent**: Zod schema for the POST body.

**Contract**: `createDigestSchema = z.object({ tagId: z.string().uuid() })`

#### 3. POST /api/digests endpoint

**File**: `src/pages/api/digests.ts`

**Intent**: Thin route that validates input, delegates to the service, and returns the new digest or an error envelope.

**Contract**: `POST` export — auth check, Supabase client creation, zod validation, try/catch calling `generateDigest`, returns `AiContent` on 201 or `{ error }` on 4xx/5xx. Must also export `const prerender = false`.

#### 4. GET /api/digests endpoint

**File**: `src/pages/api/digests.ts`

**Intent**: List endpoint for the `/ai` page to fetch all user digests on server render and for client refetches after generation.

**Contract**: `GET` export — auth check, Supabase client, try/catch calling `listDigests`, returns array on 200.

#### 5. Extended type for list response

**File**: `src/types.ts`

**Intent**: Add `AiContentWithTag` that includes the source tag name for display.

**Contract**: `AiContentWithTag extends AiContent { tag_name: string | null; }`

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Linting passes: `npm run lint`
- Manual curl test: `POST /api/digests` with a valid tag_id returns 201 with a digest body
- Manual curl test: `POST /api/digests` with a tag having 0 notes returns a descriptive 422 error
- Manual curl test: `GET /api/digests` returns the created digest in the list

#### Manual Verification:

- Verify digest body is grounded — contains only themes/decisions from the actual notes, no hallucinated facts
- Verify "since last digest" windowing: generate twice for same tag (second should only cover notes created after the first)
- Verify LLM timeout scenario: if OpenRouter is slow, the 25s timeout fires and returns a clean error

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Frontend

### Overview

Add the "Generate digest" button to the tag filter bar on `/notes` and create the `/ai` page with a React island showing the digest list, skeleton loading, and error states.

### Changes Required:

#### 1. "Generate digest" button on notes page

**File**: `src/components/notes/NoteCapture.tsx`

**Intent**: When a tag is actively filtered, show a "Generate digest" button next to the tag pills. Clicking it calls `POST /api/digests`, shows inline spinner on the button, and on success navigates to `/ai` (or shows a success toast linking there).

**Contract**: Button renders conditionally when `activeTagId !== null`. On click: set loading state, `fetch('/api/digests', { method: 'POST', body: { tagId: activeTagId } })`, on success redirect to `/ai`, on error show inline error message + "Try again" button. The button uses the existing `cn()` utility for conditional styling.

#### 2. Middleware update

**File**: `src/middleware.ts`

**Intent**: Gate the new `/ai` route behind authentication.

**Contract**: Add `"/ai"` to `PROTECTED_ROUTES` array.

#### 3. AI page (Astro route)

**File**: `src/pages/ai.astro`

**Intent**: Server-rendered page that fetches the user's digests and passes them to a React island for display.

**Contract**: Protected page (middleware-gated). Server-fetches `listDigests` via the service. Renders `DigestList` React island with `client:load`. Layout wraps with existing `Layout.astro`.

#### 4. DigestList React island

**File**: `src/components/ai/DigestList.tsx`

**Intent**: Renders the list of AI-generated digests newest-first. Each item shows the source tag name, creation date, and the digest body (rendered as text/markdown-like sections). Empty state when no digests exist yet.

**Contract**: Props: `initialDigests: AiContentWithTag[]`. Renders a styled list with tag badge, date, and body. Empty state: "No digests yet. Select a tag on your notes and click 'Generate digest' to get started." Skeleton variant for loading.

#### 5. Navigation links on authenticated pages

**File**: `src/pages/notes.astro`, `src/pages/dashboard.astro`, `src/pages/ai.astro`

**Intent**: Add cross-navigation between authenticated pages. Currently no shared nav exists on authenticated routes (Topbar.astro is landing-page only). Add a minimal inline nav row above the island on each page.

**Contract**: Each of the three authenticated Astro pages (`notes.astro`, `dashboard.astro`, `ai.astro`) renders a `<nav>` element in its frontmatter-template area (above the React island) with links to `/notes`, `/dashboard`, and `/ai` (current page highlighted). Styled with Tailwind as a simple horizontal link row. The "AI for me" label is used for the `/ai` link.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- On `/notes` with a tag selected, "Generate digest" button appears; without a tag selected, it does not
- Clicking "Generate digest" shows spinner, then redirects to `/ai` with the new digest visible
- Clicking "Generate digest" with no new notes since last digest shows a clear error message
- `/ai` page shows all past digests newest-first with tag labels and dates
- `/ai` page shows empty state when no digests exist
- Nav links visible on `/notes`, `/dashboard`, and `/ai` with current page highlighted
- LLM failure shows error message + "Try again" button (simulate by using invalid API key or unreachable endpoint)
- NFR check: no more than 2 seconds without visible progress (spinner appears immediately on click)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- (No test runner configured — skip for MVP per project conventions)

### Integration Tests:

- (No test runner configured — skip for MVP)

### Manual Testing Steps:

1. Create 3+ notes with tag "work"
2. Filter by "work" tag on `/notes`
3. Click "Generate digest" — verify spinner appears immediately
4. Verify redirect to `/ai` with a new digest entry
5. Verify digest content references themes from the 3 notes (grounding check)
6. Create 2 more notes with tag "work"
7. Generate another digest — verify it only covers the 2 new notes (windowing)
8. Try generating for a tag with 0 notes since last digest — verify error message
9. Navigate to `/ai` directly — verify all digests listed newest-first
10. Log out, access `/ai` directly — verify redirect to sign-in

## Performance Considerations

- The LLM call dominates latency (~2-10s). The 25s timeout in `chatCompletion` is the ceiling. NFR is met via immediate spinner feedback.
- Cloudflare Workers Free tier has 10ms CPU cap — `JSON.parse` of the LLM response + Supabase queries should fit comfortably (no iteration over many users, single-user context).
- Note content is sent in full to the LLM. For users with very long notes or many notes per tag, token limits may be hit — addressed by the `maxTokens` option and the model's context window. Mitigation: truncate oldest notes if total exceeds a reasonable prompt size (e.g. 50k chars). Include this safeguard in the service.

## Migration Notes

- `ai_content` table is additive — no existing data affected.
- RLS policies follow the same pattern as `notes`/`tags`/`note_tags`.
- The `kind` column uses a CHECK constraint (not a Postgres enum) for easier future extension without a migration.

## References

- Roadmap S-02: `context/foundation/roadmap.md` lines 107-119
- PRD FR-015, FR-016: `context/foundation/prd.md` lines 115-118
- LLM service: `src/lib/services/llm.ts`
- Notes service pattern: `src/lib/services/notes.ts`
- Existing migration: `supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Layer

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push`
- [x] 1.2 TypeScript compiles: `npm run build`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [ ] 1.4 Verify ai_content table structure, indexes, and RLS in Supabase Studio
- [ ] 1.5 Verify RLS isolation (cross-user read returns 0 rows)

### Phase 2: Service & API

#### Automated

- [ ] 2.1 TypeScript compiles: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 POST /api/digests with valid tag_id returns 201
- [ ] 2.4 POST /api/digests with 0 qualifying notes returns 422
- [ ] 2.5 GET /api/digests returns the digest list

#### Manual

- [ ] 2.6 Digest body is grounded — no hallucinated facts
- [ ] 2.7 "Since last digest" windowing works correctly
- [ ] 2.8 LLM timeout returns clean error

### Phase 3: Frontend

#### Automated

- [ ] 3.1 TypeScript compiles: `npm run build`
- [ ] 3.2 Linting passes: `npm run lint`

#### Manual

- [ ] 3.3 "Generate digest" button appears only when a tag is selected
- [ ] 3.4 Click shows spinner then redirects to /ai with new digest
- [ ] 3.5 0-notes-since-last-digest shows error message
- [ ] 3.6 /ai page lists digests newest-first with tag labels
- [ ] 3.7 /ai empty state renders correctly
- [ ] 3.8 Nav links visible on /notes, /dashboard, and /ai with correct highlighting
- [ ] 3.9 LLM failure shows error + "Try again"
- [ ] 3.10 NFR: spinner appears within <2s of click
