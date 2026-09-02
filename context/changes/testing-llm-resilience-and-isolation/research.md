---
date: 2026-09-02T22:02:00+02:00
researcher: AI Agent
git_commit: 7e1a3ee4a693055cdc78e2b4ecd3a0e71960c736
branch: main
repository: myNotes
topic: "LLM resilience and cross-user data isolation — test coverage research for Phase 1"
tags: [research, codebase, llm, data-isolation, testing, vitest, phase-1]
status: complete
last_updated: 2026-09-02
last_updated_by: AI Agent
---

# Research: LLM Resilience and Cross-User Data Isolation

**Date**: 2026-09-02T22:02:00+02:00
**Researcher**: AI Agent
**Git Commit**: 7e1a3ee4a693055cdc78e2b4ecd3a0e71960c736
**Branch**: main
**Repository**: myNotes

## Research Question

What does the codebase look like at the testable boundaries for Phase 1 of the test plan — LLM response parsing/error handling (Risk #1) and cross-user data isolation (Risk #2)? Where are the failure modes, what gets tested, what's the mocking surface, and what does bootstrap require?

## Summary

1. **All LLM traffic** flows through a single function `chatCompletion` in `src/lib/services/llm.ts`. It has exactly **two production callers**: digest generation and weekly summary generation. Error handling is **asymmetric** between them — digest failures leave no DB row, while weekly summary failures persist a `weekly-failed` marker.

2. **Data isolation** uses defense-in-depth: cookie-scoped SSR Supabase client (anon key) → RLS on all 4 tables → explicit `user_id` filters in every service function. The only RLS bypass is the weekly-summary cron via admin client in `src/worker.ts`.

3. **No test infrastructure exists** — zero test files, no Vitest/Jest deps, no test scripts. The project is ESM (`"type": "module"`) with Vite 7, making Vitest a natural fit. Main bootstrap hurdle: mocking `astro:env/server` virtual imports.

4. **The highest-value test gap** is the `content: ""` path — `chatCompletion` treats an empty-string LLM response as success, which would store an empty digest/weekly body. Combined with the digest-vs-weekly error asymmetry, this is the primary area for Phase 1 coverage.

## Detailed Findings

### 1. LLM Integration Layer (`src/lib/services/llm.ts`)

**Entry point**: `chatCompletion(messages: LlmMessage[], opts?: LlmCompletionOptions): Promise<LlmCompletion>` (line 75).

**Pre-flight validation:**
- No API key → `LlmNotConfiguredError` (line 78)
- Empty messages → `LlmRequestError` (line 81)

**Request construction (lines 84–100):**
- `provider: { data_collection: "deny" }` is hardcoded — not caller-optional
- Default model: `DEFAULT_LLM_MODEL = "anthropic/claude-haiku-4.5"` (line 9)
- 25-second timeout via `AbortController` (lines 102–108)

**Response parsing chain (lines 132–156):**

| Step | Condition | Outcome |
|------|-----------|---------|
| JSON parse | `res.json()` throws | `LlmRequestError("non-JSON response", res.status)` |
| HTTP status | `!res.ok` | `LlmRequestError` with provider detail + status |
| Text extraction | `choices?.[0]?.message?.content` not a string | `LlmRequestError("missing completion text", res.status)` |
| Empty string | `content: ""` | **Accepted as success** → `{ text: "" }` |
| Valid text | Non-empty string | `{ text, usage? }` |

**Key error classes** (lines 25–40):
- `LlmNotConfiguredError` — missing API key
- `LlmRequestError` — all HTTP/parsing failures, carries optional `status`

**Failure-mode matrix for test planning:**

| Scenario | Error thrown | `status` on error | DB impact (digest) | DB impact (weekly) |
|----------|-------------|-------------------|--------------------|--------------------|
| No API key | `LlmNotConfiguredError` | — | 503 via `DigestError` | Caught in worker |
| Network error | `LlmRequestError` | — | No row | `weekly-failed` row |
| Timeout (25s) | `LlmRequestError` | — | No row | `weekly-failed` row |
| Non-JSON body | `LlmRequestError` | HTTP status | No row | `weekly-failed` row |
| 429 rate limit | `LlmRequestError` | 429 | No row | `weekly-failed` row |
| 500 server error | `LlmRequestError` | 500 | No row | `weekly-failed` row |
| 200 + empty choices | `LlmRequestError` | 200 | No row | `weekly-failed` row |
| 200 + missing content | `LlmRequestError` | 200 | No row | `weekly-failed` row |
| 200 + `content: ""` | **None (success)** | — | **Empty body stored** | **Empty body stored** |
| 200 + valid text | None (success) | — | Digest stored | Weekly stored |

### 2. Digest Generation (`src/lib/services/digest.ts`)

**`generateDigest(supabase, userId, tagId): Promise<AiContent>`** (line 139).

**Flow:**
1. LLM config check (line 140) → `DigestError` 503
2. Fetch last digest watermark for tag (line 144) — `since = lastDigest?.created_at ?? null`
3. Fetch notes since watermark, limit 200 (line 151) — explicit `user_id` + tag filter
4. Zero notes → `DigestError` 422 (line 153)
5. Truncate notes to 50k chars total (line 158) — drops oldest
6. `chatCompletion()` (line 161) — **no try/catch**
7. Insert `ai_content` row with `kind: "digest"` (line 166)

**Error propagation:** LLM errors bubble uncaught to the API route (`src/pages/api/digests.ts:32-42`), where they become generic 500 `{ error: "Failed to generate digest" }`. No `ai_content` row is written on failure.

**Exported pure functions (testable without LLM):**
- `buildUserPrompt(notes, truncatedCount): string` (line 96)
- `truncateNotes(notes): { notes, truncatedCount }` (via internal helper)

### 3. Weekly Summary (`src/lib/services/weekly-summary.ts` + `src/worker.ts`)

**`generateWeeklySummaryForUser(supabase, userId, windowStart, openrouterApiKey): Promise<AiContent | null>`** (line 72).

**Flow:**
1. Fetch notes in 7-day window (line 78) — explicit `user_id` filter
2. < 3 notes → return `null`, no insert (line 80)
3. `chatCompletion()` in try/catch (line 89):
   - **On LLM error:** insert `kind: "weekly-failed"` fallback row (line 100), then re-throw (line 112)
   - **On success:** insert `kind: "weekly"` (line 115)
4. Insert failure after LLM success → same `weekly-failed` fallback (line 130)

**Worker cron entry** (`src/worker.ts`):
- Cron: `"0 3 * * 1"` (Mon 03:00 UTC) in `wrangler.jsonc` line 27
- `runWeeklySummaries(env)` via `ctx.waitUntil` (line 77)
- Admin client (`createAdminClient`) — intentional RLS bypass (line 24)
- User eligibility: query all notes in window → client-side group → `count >= 3` (lines 28–40)
- Per-user: skip if `hasWeeklySummaryInWindow` (checks `kind IN ('weekly', 'weekly-failed')`) → generate → catch per-user errors, continue loop (lines 45–61)
- Double ≥3 threshold: worker filters + service re-checks (worker line 40, service line 80)

### 4. Data Isolation Architecture

**Supabase client creation** (`src/lib/supabase.ts`):
- `createClient(requestHeaders, cookies)` wraps `@supabase/ssr` `createServerClient`
- Uses anon key (`SUPABASE_KEY`), not service-role
- Session JWT from cookies → PostgREST `authenticated` role → `auth.uid()` resolves per-request

**Admin client** (`src/lib/supabase-admin.ts`):
- `createAdminClient(url, serviceRoleKey)` — bypasses RLS
- Used **only** in `src/worker.ts` for cron

**RLS policies on all 4 tables:**

| Table | RLS | Policies | `auth.uid()` pattern |
|-------|-----|----------|---------------------|
| `notes` | Enabled | SELECT/INSERT/UPDATE/DELETE | `(select auth.uid()) = user_id` (hardened) |
| `tags` | Enabled | SELECT/INSERT/UPDATE/DELETE | `(select auth.uid()) = user_id` (hardened) |
| `note_tags` | Enabled | SELECT/INSERT/UPDATE/DELETE | `(select auth.uid()) = user_id` (hardened) |
| `ai_content` | Enabled | SELECT/INSERT/UPDATE/DELETE | `auth.uid() = user_id` (bare — not hardened) |

**Composite FK hardening on `note_tags`** (`20260820213408_note_tags_composite_owner_fks.sql`):
- `(note_id, user_id)` → `notes(id, user_id)`
- `(tag_id, user_id)` → `tags(id, user_id)`
- Prevents linking another user's note/tag even if UUID is known

**Double defense in services:** Every query has explicit `.eq("user_id", userId)` AND RLS. No service accepts `user_id` from client input — always from `context.locals.user`.

**API route pattern:** Auth from `context.locals.user` → 401 if null → user-scoped client → `user.id` to services. No route accepts `user_id` in the request body. Middleware protects SSR pages (`/dashboard`, `/notes`, `/ai`) but **not** `/api/*` — API routes enforce 401 themselves.

### 5. API Route Contracts (test surface)

| Route | Methods | Auth | Key validation | Error codes |
|-------|---------|------|----------------|-------------|
| `/api/notes` | POST, GET | 401 | `createNoteSchema` (content, tagNames?) | 400, 401, 500 |
| `/api/notes/[id]` | PATCH, DELETE | 401 | `z.uuid()` param + `updateNoteSchema` | 400, 401, 404, 500 |
| `/api/tags` | GET | 401 | None | 401, 500 |
| `/api/digests` | POST, GET | 401 | `createDigestSchema` (tagId: uuid) | 400, 401, 422, 503, 500 |
| `/api/ai-content/[id]` | PATCH, DELETE | 401 | `z.uuid()` param + `updateAiContentSchema` | 400, 401, 404, 500 |

Shared `json()` helper in `src/lib/http.ts`. Error envelope: `{ error: string, issues?: ZodIssue[] }`.

### 6. Test Infrastructure Status

**Current state: greenfield — zero test files, zero test dependencies.**

| Aspect | Status | Detail |
|--------|--------|--------|
| Test runner | Missing | No Vitest/Jest installed |
| Test scripts | Missing | No `test` in `package.json` scripts |
| Test files | Zero | No `*.test.ts`, `*.spec.ts`, `__tests__/` |
| ESLint test overrides | Missing | No Vitest globals config |
| CI test step | Missing | Only lint + build in `.github/workflows/ci.yml` |

**Vitest compatibility (favorable):**
- ESM project (`"type": "module"`)
- Vite 7 override in `package.json` (Vitest 3.x compatible)
- `@/*` path alias already configured in `tsconfig.json`
- Node.js 22.14.0

**Bootstrap requirements:**
1. Install `vitest` (+ `@vitest/coverage-v8` optionally)
2. Create `vitest.config.ts` with `resolve.alias` for `@/*`
3. Mock `astro:env/server` — 3 files import from it: `supabase.ts`, `llm.ts`, `config-status.ts`
4. Add `"test"` script to `package.json`
5. ESLint override for test files (Vitest globals)

**Mocking surface for Phase 1 tests:**

| What to mock | Why | How |
|--------------|-----|-----|
| `astro:env/server` | Virtual module not available outside Astro | `vi.mock("astro:env/server", ...)` |
| `global.fetch` | LLM HTTP calls to OpenRouter | `vi.fn()` or `vi.stubGlobal("fetch", ...)` |
| `@supabase/ssr` / Supabase client | DB operations | Mock client factory or use Supabase local (Docker) |

## Code References

- `src/lib/services/llm.ts:75-156` — `chatCompletion` function (full parsing chain)
- `src/lib/services/llm.ts:25-40` — Error classes (`LlmNotConfiguredError`, `LlmRequestError`)
- `src/lib/services/llm.ts:53-56` — `completionText` extraction (empty string accepted)
- `src/lib/services/digest.ts:139-182` — `generateDigest` (no try/catch around LLM)
- `src/lib/services/digest.ts:96-105` — `buildUserPrompt` (pure, exported, testable)
- `src/lib/services/digest.ts:69-94` — `fetchNotesSinceForTag` (user-scoped)
- `src/lib/services/weekly-summary.ts:72-141` — `generateWeeklySummaryForUser` (with `weekly-failed` fallback)
- `src/lib/services/weekly-summary.ts:31-49` — `fetchUserNotesInWindow` (user-scoped)
- `src/worker.ts:13-70` — `runWeeklySummaries` (admin client, eligibility scan, per-user loop)
- `src/worker.ts:72-79` — Worker entry (fetch + scheduled handlers)
- `src/lib/supabase.ts:5-24` — SSR client creation (cookie-scoped, anon key)
- `src/lib/supabase-admin.ts:3-6` — Admin client (service-role, RLS bypass)
- `src/middleware.ts:4-21` — Auth gate, `PROTECTED_ROUTES`, user resolution
- `src/pages/api/digests.ts:32-42` — Digest route error handling
- `src/pages/api/notes.ts:11-42` — Notes POST handler
- `src/pages/api/notes/[id].ts:14-82` — Notes PATCH/DELETE with UUID validation
- `src/pages/api/ai-content/[id].ts:14-82` — AI content PATCH/DELETE
- `src/lib/http.ts:4-9` — Shared `json()` response helper
- `src/lib/validation/notes.ts:8-28` — Zod schemas for notes
- `src/lib/validation/digest.ts:3-13` — Zod schemas for digests/ai-content
- `supabase/migrations/20260819205610_notes_tags_note_tags_schema_rls.sql` — Core schema + RLS
- `supabase/migrations/20260820213408_note_tags_composite_owner_fks.sql` — Composite FK hardening
- `supabase/migrations/20260820213409_rls_hardening.sql` — Initplan-style `(select auth.uid())`
- `supabase/migrations/20260827203449_ai_content_table.sql` — `ai_content` schema + RLS
- `supabase/migrations/20260831224900_ai_content_weekly_failed_kind.sql` — `weekly-failed` kind

## Architecture Insights

### Asymmetric error handling (digest vs weekly)

This is the single most important architectural pattern for Phase 1 test planning:

| Aspect | Digest | Weekly Summary |
|--------|--------|----------------|
| LLM error → DB | **No row** (error bubbles to API) | `weekly-failed` row persisted |
| Client visibility | Generic 500 JSON | N/A (cron, no HTTP) |
| Idempotency marker | None (re-triggerable) | `weekly-failed` blocks retry in window |
| Empty response | Stores empty `body` | Stores empty `body` |

**Consequence:** A digest LLM failure is invisible at the DB level — only a 500 in logs. A weekly failure has a visible marker but the marker also prevents retry within the 7-day window (the `hasWeeklySummaryInWindow` check sees `weekly-failed`).

### Defense-in-depth for data isolation

Three independent layers, all of which must fail simultaneously for a cross-user leak:
1. **RLS policies** — `auth.uid() = user_id` on every operation, every table
2. **Explicit `user_id` filters** — every service query includes `.eq("user_id", userId)`
3. **Composite FKs** — `note_tags` prevents cross-user note↔tag linking at the DB level

### Virtual module dependency (`astro:env/server`)

Three production files import from `astro:env/server`, which only resolves inside the Astro build pipeline. This is the primary ergonomic obstacle for unit testing — each file needs either:
- `vi.mock("astro:env/server", ...)` at the test level, or
- Dependency injection (partially done: `llm.ts` accepts `opts.apiKey`, `supabase-admin.ts` takes args)

## Historical Context (from prior changes)

- `context/archive/2026-08-26-llm-provider-contract/` — F-02 established the LLM integration layer, `data_collection: "deny"` enforcement, and `DEFAULT_LLM_MODEL` constant.
- `context/archive/2026-08-27-first-ai-digest-on-click/` — S-02 created the `ai_content` table, digest service, and the digest API route.
- `context/archive/2026-08-31-weekly-summary-cron/` — S-08 added the weekly summary cron, `weekly-failed` kind, and the admin client pattern.
- `context/archive/2026-08-19-notes-schema-and-rls/` — F-01 established the core schema with RLS; later hardened in the RLS hardening migration.
- `context/foundation/lessons.md` — Established rules about API error envelopes (JSON on every path), not swallowing errors in partial-success catches, validating dynamic route params, and hoisting shared helpers.

## Open Questions

1. **Empty-string LLM response** — `chatCompletion` accepts `content: ""` as valid. Should the plan include a guard in the service layer (treat empty as error), or only test that the current behavior is intentional?

2. **`ai_content` RLS inconsistency** — Uses bare `auth.uid()` instead of `(select auth.uid())` initplan pattern used on other tables. Functionally equivalent but worth a hardening migration, or accept as-is for Phase 1?

3. **Worker test approach** — `runWeeklySummaries` uses admin client and reads from `env` (not `astro:env/server`). Should Phase 1 test this at the function level (mock Supabase + fetch) or defer cron testing to Phase 2?

4. **Integration test DB strategy** — Should tests use a local Supabase instance (Docker, real RLS) or mock the Supabase client? Real DB gives RLS coverage but adds Docker dependency; mocks are faster but skip RLS validation.
