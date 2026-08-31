# Weekly Summary Cron Implementation Plan

## Overview

Wire a Monday 03:00 UTC Cloudflare Cron Trigger that generates grounded AI weekly summaries for eligible users (≥3 notes in past 7 days), displayed alongside per-tag digests in the `/ai` ("AI dla mnie") section. Uses the same 4-section format as digests, with a `kind='weekly-failed'` fallback for error visibility.

## Current State Analysis

The `ai_content` table already carries a `kind` CHECK of `'digest' | 'weekly'` and a nullable `source_tag_id` — the schema is designed for weekly entries but nothing inserts them. The per-tag digest flow (`src/lib/services/digest.ts`) is mature: system prompt → note fetch → truncation → LLM call → insert. The `/ai` page renders a flat list of `kind='digest'` entries via `listDigests()` and the `DigestList`/`DigestItem` React island.

No cron infrastructure exists: `wrangler.jsonc` points at the default Astro entry (`@astrojs/cloudflare/entrypoints/server`), there is no `src/worker.ts`, no `triggers` block, and no `scheduled()` handler. The Supabase client (`src/lib/supabase.ts`) is cookie-based — it cannot authenticate in a scheduled handler where no user request exists.

## Desired End State

Every Monday at 03:00 UTC, the system automatically generates a structured weekly summary for each user who created ≥3 notes in the past 7 days. The summary appears in the `/ai` section with a "Weekly" badge, using the same 4-section format as per-tag digests (Tematy, Kluczowe decyzje, Otwarte wątki, Sprzeczności). Failed generations produce a user-visible warning entry (`kind='weekly-failed'`) with an amber badge. Users below the threshold get no entry. Duplicate runs in the same window are idempotent (skipped).

### Key Discoveries:

- `@astrojs/cloudflare` v13.5.0 exports `handle` from `@astrojs/cloudflare/handler` — custom entry shape is `export default { fetch, scheduled } satisfies ExportedHandler<Env>` (`src/lib/services/digest.ts`)
- `scheduled(controller, env, ctx)` receives Worker bindings via `env` — this is the only reliable env access path in cron context (`astro:env/server` may not be initialized for scheduled invocations)
- Free-tier CPU cap (10 ms) constrains but doesn't block: I/O to Supabase/OpenRouter is wall-clock only; JSON.parse of a ~4 KB LLM response is the main CPU cost per user (`context/foundation/infrastructure.md` §Pre-Mortem)
- `truncateNotes()` and `buildUserPrompt()` in `digest.ts` are reusable for weekly summaries (same shape, different scope)

## What We're NOT Doing

- No `ai_run_failures` table — using `kind='weekly-failed'` in `ai_content` instead (less migration effort, built-in history, user-visible)
- No streaming/SSE for weekly generation (background job, no user watching)
- No retry mechanism — if generation fails, user sees a warning entry; next week's cron tries again
- No per-user timezone handling — rolling 7 days from cron fire time at 03:00 UTC
- No UI for manually triggering weekly summary generation
- No Paid-tier upgrade — staying on Free; upgrade documented as tripwire in `wrangler.jsonc` comments

## Implementation Approach

Extend the Worker with a custom entry point (`src/worker.ts`) that re-exports Astro's `fetch` handler and adds a `scheduled()` handler. The scheduled handler creates a Supabase admin client (service role key, bypassing RLS) to enumerate eligible users and generates summaries sequentially. The weekly summary service mirrors the existing digest generation pattern but operates cross-tag over a rolling 7-day window. UI changes extend the `/ai` page to show all `ai_content` kinds in a mixed chronological list with type badges.

## Critical Implementation Details

### Timing & lifecycle

The `scheduled()` handler receives `env` as its second parameter — this is the only reliable way to access Worker bindings (secrets) in the scheduled context. `astro:env/server` is initialized by Astro's `handle()` during fetch requests and may not be available when a scheduled invocation fires before any fetch. The admin Supabase client and LLM API key must be sourced from `env` directly. The `chatCompletion` wrapper in `llm.ts` needs an optional API key parameter for this reason.

---

## Phase 1: Infrastructure & Schema

### Overview

Wire the cron trigger, create the custom Worker entry point, add the admin Supabase client factory, register the new environment variable, and prepare the schema for `weekly-failed` entries.

### Changes Required:

#### 1. Custom Worker Entry Point

**File**: `src/worker.ts` (new)

**Intent**: Create the Worker entry point that re-exports Astro's fetch handler and adds a skeleton `scheduled()` handler. This is the foundation all other phases build on.

**Contract**: Default export `{ fetch, scheduled }` where `fetch` delegates to `handle` from `@astrojs/cloudflare/handler`. The `scheduled` handler logs a heartbeat for now (Phase 3 fills in the real logic). Typed as `ExportedHandler<Env>`.

Define an `Env` interface inline (or in a shared `src/worker-env.d.ts`) declaring the Worker bindings the handlers use:

- `SUPABASE_URL: string`
- `SUPABASE_KEY: string`
- `SUPABASE_SERVICE_ROLE_KEY: string`
- `OPENROUTER_API_KEY: string`
- `ASSETS: Fetcher` (required by the Astro `handle` function for static asset serving)

```typescript
import { handle } from "@astrojs/cloudflare/handler";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENROUTER_API_KEY: string;
  ASSETS: Fetcher;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handle(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    console.log("weekly-summary cron fired", controller.cron, new Date().toISOString());
  },
} satisfies ExportedHandler<Env>;
```

#### 2. Wrangler Configuration

**File**: `wrangler.jsonc`

**Intent**: Point the Worker at the custom entry and register the Monday 03:00 UTC cron trigger. Both changes must land atomically — custom entry without triggers is dead code; triggers without a scheduled handler is a runtime error.

**Contract**: Change `"main"` from `"@astrojs/cloudflare/entrypoints/server"` to `"./src/worker.ts"`. Add `"triggers": { "crons": ["0 3 * * 1"] }` at the top level. Update the stale tripwire comment on line 10 — replace the `ai_run_failures` Supabase table reference with `kind='weekly-failed'` in `ai_content` (matches this plan's error-handling approach).

#### 3. Admin Supabase Client Factory

**File**: `src/lib/supabase-admin.ts` (new)

**Intent**: Provide a Supabase client that bypasses RLS for background jobs (cron) where there are no user cookies. Uses the service role key.

**Contract**: Export `createAdminClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient`. Uses `createClient` from `@supabase/supabase-js` (not `@supabase/ssr`) with `auth: { persistSession: false, autoRefreshToken: false }`. Caller passes values from the Worker's `env` parameter.

#### 4. Environment Variable Registration

**File**: `astro.config.mjs`

**Intent**: Declare `SUPABASE_SERVICE_ROLE_KEY` in the Astro env schema so the build system knows about it.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })` to `env.schema`.

**File**: `.env.example`

**Intent**: Document the new secret for developer onboarding.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY=###` line.

#### 5. Schema Migration — weekly-failed Kind

**File**: `supabase/migrations/YYYYMMDDHHMMSS_ai_content_weekly_failed_kind.sql` (new)

**Intent**: Allow `kind='weekly-failed'` in the `ai_content` table so failed weekly summaries can be persisted alongside successful ones.

**Contract**: DROP the existing CHECK constraint on `ai_content.kind` and re-CREATE it to include `'weekly-failed'`. The constraint becomes: `kind IN ('digest', 'weekly', 'weekly-failed')`.

#### 6. TypeScript Type Update

**File**: `src/types.ts`

**Intent**: Align the `AiContent.kind` TypeScript union with the updated schema.

**Contract**: Change `kind: "digest" | "weekly"` to `kind: "digest" | "weekly" | "weekly-failed"`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Dev server starts: `npm run dev`
- Migration applies cleanly against local Supabase

#### Manual Verification:

- `npm run dev` → hit `http://localhost:4321/cdn-cgi/handler/scheduled` → heartbeat log appears in console
- Existing `/ai` page still works (no regression from entry point swap)
- Existing digest generation still works (fetch handler delegates to `handle` unchanged)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Weekly Summary Service

### Overview

Create the weekly summary generation service — cross-tag note fetching over a rolling 7-day window, ≥3 threshold gate, LLM call with grounded 4-section prompt, insert with `kind='weekly'`, error handling with `kind='weekly-failed'`.

### Changes Required:

#### 1. Export Shared Helpers from Digest Service

**File**: `src/lib/services/digest.ts`

**Intent**: Make `truncateNotes`, `buildUserPrompt`, and `NoteRow` available to the weekly summary service to avoid code duplication.

**Contract**: Export the `NoteRow` interface, `truncateNotes()`, and `buildUserPrompt()` functions. No behavior change to existing code.

#### 2. Weekly Summary Service

**File**: `src/lib/services/weekly-summary.ts` (new)

**Intent**: Core service that generates a weekly summary for a single user. Mirrors the digest flow but cross-tag, 7-day window, with error-to-failed-entry handling.

**Contract**:

- `generateWeeklySummaryForUser(supabase: SupabaseClient, userId: string, windowStart: string, openrouterApiKey: string): Promise<AiContent>` — fetches all user notes since `windowStart`, checks ≥3 threshold, truncates, builds prompt, calls LLM, inserts `kind='weekly'` with `source_tag_id: null`.
- On threshold failure (< 3 notes): returns early (no insert, no error — this is expected).
- On LLM or insert error: inserts `kind='weekly-failed'` with user-friendly body (`"Nie udało się wygenerować tygodniowego podsumowania za ten tydzień."`) and re-throws.
- `hasWeeklySummaryInWindow(supabase: SupabaseClient, userId: string, windowStart: string): Promise<boolean>` — idempotency check. Returns true if a row with `kind IN ('weekly', 'weekly-failed')` and `created_at > windowStart` exists for this user.

The system prompt is adapted from the digest `SYSTEM_PROMPT`: same 4 sections (Tematy, Kluczowe decyzje, Otwarte wątki, Sprzeczności), same grounding rules, but scoped to "weekly summary from all recent notes" instead of "digest from tag-specific notes". Same language-matching rule.

Internal helpers:
- `fetchUserNotesInWindow(supabase, userId, windowStart)` — `SELECT id, content, created_at FROM notes WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 200`, reversed to chronological. No tag join.
- Reuses `truncateNotes()` and `buildUserPrompt()` imported from `digest.ts`.

#### 3. LLM Wrapper Extension

**File**: `src/types.ts`

**Intent**: Extend the options type to carry an explicit API key.

**Contract**: Add `apiKey?: string` to the `LlmCompletionOptions` interface.

**File**: `src/lib/services/llm.ts`

**Intent**: Allow calling `chatCompletion` with an explicit API key for the scheduled handler context where `astro:env/server` may not be available.

**Contract**: When `opts.apiKey` is provided, use it instead of the `OPENROUTER_API_KEY` module-level import for both the availability guard and the `Authorization` header. Existing callers (digest service) pass no `apiKey` and are unaffected.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Service is wired in Phase 3 for end-to-end verification — no standalone manual test at this phase.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Scheduled Handler Orchestration

### Overview

Wire the `scheduled()` handler to enumerate eligible users, iterate sequentially, call the weekly summary service per user with idempotency guard and per-user error isolation.

### Changes Required:

#### 1. Scheduled Handler Logic

**File**: `src/worker.ts`

**Intent**: Replace the skeleton heartbeat with the real orchestration logic: admin client setup, eligible user enumeration, sequential per-user generation with try/catch.

**Contract**: The `scheduled()` handler body:

1. Guard: bail early if `env.SUPABASE_URL`, `env.SUPABASE_SERVICE_ROLE_KEY`, or `env.OPENROUTER_API_KEY` is missing (log error, return).
2. Create admin Supabase client via `createAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)`.
3. Compute `windowStart` = `new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()`.
4. Query eligible users: `SELECT user_id FROM notes WHERE created_at > windowStart GROUP BY user_id HAVING count(*) >= 3`. This runs as the admin client (bypasses RLS).
5. For each `userId` (sequential `for...of`):
   - Call `hasWeeklySummaryInWindow(supabase, userId, windowStart)` — skip if `true`.
   - Call `generateWeeklySummaryForUser(supabase, userId, windowStart, env.OPENROUTER_API_KEY)`.
   - Wrap in per-user `try/catch` — log error via `console.error`, continue to next user (one user's failure must not block others).
6. Wrap entire handler body in outer `try/catch` with `console.error` for infra-level failures.
7. Use `ctx.waitUntil(promise)` to ensure the handler stays alive for the full sequential iteration.
8. Log CPU budget: `Date.now()` deltas at start/end for Free-tier monitoring.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `npm run dev` → hit `http://localhost:4321/cdn-cgi/handler/scheduled`
- With ≥3 notes in last 7 days for the test user: weekly summary appears in `ai_content` table with `kind='weekly'`
- With <3 notes: no entry created
- With existing weekly entry in window: user skipped (idempotency)
- On simulated LLM failure (e.g. invalid/missing API key): `kind='weekly-failed'` entry created with user-friendly body

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: UI Updates

### Overview

Update the `/ai` page to display all `ai_content` kinds (digest, weekly, weekly-failed) in a mixed chronological list with type badges and warning styling for failed entries.

### Changes Required:

#### 1. List Function for All AI Content

**File**: `src/lib/services/digest.ts`

**Intent**: Add a function that returns all non-deleted `ai_content` for a user (not just digests), so the `/ai` page shows both digests and weekly summaries.

**Contract**: `listAllAiContent(supabase: SupabaseClient, userId: string): Promise<AiContentWithTag[]>` — identical to `listDigests()` but without the `.eq("kind", "digest")` filter. Returns all kinds, ordered by `created_at desc`, filtered by `deleted_at IS NULL`. Keep `listDigests()` for backward compatibility (the `GET /api/digests` route may still need it).

#### 2. Page Data Source

**File**: `src/pages/ai.astro`

**Intent**: Switch from `listDigests()` to `listAllAiContent()` so weekly summaries are included in the server-rendered page.

**Contract**: Import and call `listAllAiContent` instead of `listDigests`. Pass results as `initialDigests` prop to `<DigestList>` (prop name unchanged for simplicity).

#### 3. Type Badge and Warning Style

**File**: `src/components/ai/DigestItem.tsx`

**Intent**: Visually distinguish digest, weekly, and weekly-failed entries with type badges and conditional styling.

**Contract**:

- `kind === 'digest'`: show tag badge (existing behavior, unchanged).
- `kind === 'weekly'`: show a "Weekly" badge (teal/blue styling, calendar icon from lucide-react) instead of the tag badge. Date display unchanged.
- `kind === 'weekly-failed'`: show a "Weekly" badge + warning treatment — amber/yellow border on the card, muted text, alert-triangle icon. Edit button hidden (body is an informational error message, not editable content). Delete button remains available (user can dismiss the warning).
- `isEdited` indicator logic unchanged — applies to all editable kinds.

#### 4. Empty State Update

**File**: `src/components/ai/DigestList.tsx`

**Intent**: Update the empty state message to mention both digests and weekly summaries.

**Contract**: Adjust the empty-state text from "No digests yet" to reflect that the section contains both AI digests and weekly summaries.

#### 5. Client Hook — No Changes

**File**: `src/components/hooks/useDigests.ts`

**Intent**: Verify no changes are needed.

**Contract**: The hook is generic over `AiContentWithTag[]` and already works with all kinds. `updateDigest` (PATCH) and `deleteDigest` (DELETE) use `/api/ai-content/:id` which is kind-agnostic. No modifications required.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `/ai` page shows weekly summaries with "Weekly" badge, chronologically mixed with digests
- Weekly-failed entries show warning styling (amber/yellow border, alert icon)
- Weekly-failed entries have no edit button, only delete
- Weekly summaries are editable inline (same UX as digests)
- Weekly summaries are deletable via soft-delete (same UX as digests)
- Digest display and functionality unchanged (no regression)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- No test runner is configured in this project. Unit tests are deferred.

### Integration Tests:

- No test runner is configured. Integration tests are deferred.

### Manual Testing Steps:

1. Start dev server (`npm run dev`), verify existing `/ai` page still works
2. Create ≥3 notes for a test user in the past 7 days
3. Hit `http://localhost:4321/cdn-cgi/handler/scheduled` to trigger cron manually
4. Verify: weekly summary appears in `/ai` with "Weekly" badge and 4-section body
5. Verify: weekly summary is editable inline and deletable
6. Hit scheduled endpoint again — verify idempotency (no duplicate entry)
7. Delete all notes to simulate <3 notes — re-trigger cron — verify no entry generated
8. Simulate LLM failure (e.g. remove `OPENROUTER_API_KEY` from `.dev.vars`) — verify `kind='weekly-failed'` entry with warning style
9. Delete the weekly-failed entry — verify soft-delete works
10. Run `npm run build` — verify production build succeeds with the custom entry point

## Performance Considerations

- Sequential user iteration keeps CPU usage per-invocation low — each user's I/O wait (Supabase query + OpenRouter call) is wall-clock only, not CPU. JSON.parse of a ~4 KB LLM response is the main CPU cost per user.
- Free-tier CPU cap (10 ms): sufficient for MVP scale (single user / small user base). If multiple users cause CPU overrun, upgrade to Workers Paid ($5/mo) per tripwires documented in `wrangler.jsonc`.
- `NOTE_FETCH_LIMIT` (200) and `PROMPT_SIZE_LIMIT` (50k chars) inherited from digest service bound per-user cost.

## Migration Notes

- New migration adds `'weekly-failed'` to the CHECK constraint on `ai_content.kind` — backward compatible, does not affect existing rows.
- `SUPABASE_SERVICE_ROLE_KEY` must be provisioned:
  - Local: add to `.dev.vars`
  - Production: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
  - Find the key: Supabase Dashboard → Settings → API → service_role key (secret)
- The service role key is sensitive (bypasses RLS). Never commit it; never add to `wrangler.jsonc`.

## References

- Roadmap S-08: `context/foundation/roadmap.md` (lines 185–197)
- PRD US-01, FR-018, FR-019: `context/foundation/prd.md`
- Infrastructure cron guidance: `context/foundation/infrastructure.md` §Getting Started #6, §Pre-Mortem
- Deployment plan Phase 6: `context/changes/deployment/deployment-plan.md` (lines 320–350)
- Existing digest service: `src/lib/services/digest.ts`
- Existing AI display: `src/pages/ai.astro`, `src/components/ai/DigestItem.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Infrastructure & Schema

#### Automated

- [x] 1.1 Build passes: `npm run build`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Dev server starts: `npm run dev`
- [x] 1.4 Migration applies cleanly

#### Manual

- [x] 1.5 Scheduled endpoint fires heartbeat log
- [x] 1.6 Existing /ai page works (no regression)
- [x] 1.7 Existing digest generation works

### Phase 2: Weekly Summary Service

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 Phase 3 wires for end-to-end verification

### Phase 3: Scheduled Handler Orchestration

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Weekly summary generated for eligible user (≥3 notes)
- [ ] 3.4 No entry for ineligible user (<3 notes)
- [ ] 3.5 Idempotency: duplicate run skips existing summary
- [ ] 3.6 Failed generation produces kind='weekly-failed' entry

### Phase 4: UI Updates

#### Automated

- [ ] 4.1 Build passes: `npm run build`
- [ ] 4.2 Lint passes: `npm run lint`

#### Manual

- [ ] 4.3 Weekly summaries show with "Weekly" badge
- [ ] 4.4 Weekly-failed entries show warning style
- [ ] 4.5 Weekly-failed entries: no edit button, delete works
- [ ] 4.6 Weekly summaries editable and deletable
- [ ] 4.7 Digest display unchanged (no regression)
