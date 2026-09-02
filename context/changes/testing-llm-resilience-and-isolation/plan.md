# Testing LLM Resilience and Data Isolation — Implementation Plan

## Overview

Bootstrap Vitest from scratch and write the first test suite covering two critical risks from the test plan: LLM response resilience (Risk #1 — malformed/empty/error responses from OpenRouter) and cross-user data isolation (Risk #2 — user_id scoping in services and worker). This is Phase 1 of the phased test rollout defined in `context/foundation/test-plan.md`. Includes adding an empty-string guard to `chatCompletion` (the highest-value gap identified in research), wiring `npm test` into CI, and testing the weekly cron worker boundary.

## Current State Analysis

- **Zero test infrastructure** — no Vitest, no test files, no `test` script, no CI test step. Greenfield bootstrap.
- **ESM project** (`"type": "module"`) with Vite `^7.3.2` override — Vitest 3.x is a natural fit.
- **`astro:env/server` virtual module** is the main mocking obstacle — imported by `supabase.ts`, `llm.ts`, and `config-status.ts`. The `llm.ts` function accepts `opts.apiKey` as partial DI.
- **`chatCompletion`** accepts `content: ""` as valid success (line 149-155 of `llm.ts`), which would store empty digest/weekly bodies — the highest-value test gap.
- **Asymmetric error handling**: digest service has no try/catch (errors bubble to API as 500), weekly service catches and persists a `weekly-failed` marker.
- **Worker** (`src/worker.ts`) reads from `Env` parameter (no `astro:env/server`) — clean DI, easier to test.
- **Defense-in-depth isolation**: RLS + explicit `user_id` filters + composite FKs. `ai_content` uses bare `auth.uid()` (accepted as-is for Phase 1).

## Desired End State

After this plan is complete:

1. `npm test` runs a Vitest suite that passes locally and in CI (GitHub Actions).
2. Every failure mode in the `chatCompletion` failure matrix (timeout, non-JSON, 429, 500, empty choices, empty string) has a unit test proving the system throws `LlmRequestError` — including the new empty-string guard.
3. Digest and weekly-summary error propagation asymmetry is tested: digest LLM failure = no DB row; weekly LLM failure = `weekly-failed` row persisted.
4. Service functions are verified to always scope queries by `user_id` — a mock-based "User A cannot see User B's data" test exists for each data-reading service.
5. Worker cron logic is tested: threshold boundary (2 vs 3 notes), per-user error isolation, idempotency guard (`hasWeeklySummaryInWindow`).
6. Pure functions (`buildUserPrompt`, `truncateNotes`) have unit tests.

### Key Discoveries:

- `completionText` (llm.ts:54-56) returns `content: ""` as valid string — the guard must go after this extraction, at the `chatCompletion` level (line ~150)
- `weekly-summary.ts` imports `truncateNotes` and `buildUserPrompt` from `digest.ts` — shared pure functions, tested once
- Worker uses `createAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)` — no `astro:env/server` dependency, clean for testing
- CI currently runs: checkout → setup-node → npm ci → astro sync → lint → build (on `main` branch)
- `eslint.config.js` uses `typescript-eslint` with type-checked rules — needs test file overrides for Vitest globals
- `tsconfig.json` has `@/*` → `./src/*` path alias that `vitest.config.ts` must replicate

## What We're NOT Doing

- **No Docker / local Supabase** — all DB interactions are mocked at the Supabase client level. Real RLS validation deferred to a later phase.
- **No `ai_content` RLS migration** — bare `auth.uid()` pattern accepted as-is (functionally equivalent); noted as future hardening.
- **No e2e / browser tests** — per test plan §7 exclusions.
- **No API route handler tests** — those involve Astro's `APIContext` mocking which is complex; deferred to Phase 3 of the test plan.
- **No LLM output quality assertions** — tests verify flow behavior (error handling, DB writes, user scoping), not prose quality.

## Implementation Approach

Three phases progressing from infrastructure to tests. Phase 1 sets up the tooling so Phase 2 and 3 can focus entirely on writing tests. The empty-string guard is a small production code change bundled with its test in Phase 2.

Test files mirror the source structure: `src/lib/services/llm.test.ts`, `src/lib/services/digest.test.ts`, etc. A shared mock setup file (`src/test-setup.ts`) handles the `astro:env/server` virtual module mock globally.

## Phase 1: Test Infrastructure Bootstrap

### Overview

Install Vitest, configure it for this ESM/Vite/Astro project, add ESLint overrides for test files, wire `npm test` into CI, and create the global mock setup for `astro:env/server`.

### Changes Required:

#### 1. Install Vitest

**Intent**: Add Vitest as the test runner. It's the natural fit for a Vite 7 / ESM project.

**Contract**: `vitest` added to `devDependencies` via `npm install -D vitest`.

#### 2. Create Vitest config

**File**: `vitest.config.ts` (new file, project root)

**Intent**: Configure Vitest with the `@/*` path alias (matching `tsconfig.json`), the global setup file for `astro:env/server` mocking, and Node environment (tests run in Node, not workerd).

**Contract**: Default export from `vitest/config`'s `defineConfig`. Must include:
- `resolve.alias`: `@/` → `./src/`
- `test.setupFiles`: `["./src/test-setup.ts"]`
- `test.environment`: `"node"`
- `test.include`: `["src/**/*.test.ts"]`

#### 3. Create global test setup

**File**: `src/test-setup.ts` (new file)

**Intent**: Provide a global `vi.mock("astro:env/server", ...)` that returns stub values for `SUPABASE_URL`, `SUPABASE_KEY`, and `OPENROUTER_API_KEY`. This runs before every test file, unblocking imports from modules that depend on this virtual module.

**Contract**: Uses `vi.mock("astro:env/server", ...)` with named exports matching the env schema in `astro.config.mjs`. Default stubs: `SUPABASE_URL = "http://localhost:54321"`, `SUPABASE_KEY = "test-anon-key"`, `OPENROUTER_API_KEY = "test-openrouter-key"`.

#### 4. Add `test` script to package.json

**File**: `package.json`

**Intent**: Wire `vitest run` into the standard `npm test` invocation.

**Contract**: Add `"test": "vitest run"` to the `scripts` object.

#### 5. Add ESLint overrides for test files

**File**: `eslint.config.js`

**Intent**: Allow Vitest globals (`describe`, `it`, `expect`, `vi`) in test files without import, and relax the `no-unused-vars` pattern for test helpers.

**Contract**: New config block targeting `**/*.test.ts` files with `languageOptions.globals` including Vitest globals. Type-checked rules should still apply.

#### 6. Add `npm test` to CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Run tests in CI on every push/PR to `main`, catching regressions before merge. Positioned after `astro sync` (so types are available) and before `build`.

**Contract**: New `- run: npm test` step inserted between the `astro sync` and `lint` steps. Env vars `SUPABASE_URL` and `SUPABASE_KEY` are not needed for tests (mocked), but the step may need `OPENROUTER_API_KEY` set to a dummy value if the astro sync step resolves env schema — verify during implementation.

#### 7. Smoke test

**File**: `src/lib/services/llm.test.ts` (new file — starter)

**Intent**: Verify the entire toolchain works end-to-end — Vitest runs, path aliases resolve, `astro:env/server` mock loads, and a trivial test passes.

**Contract**: One `describe("chatCompletion")` block with a single `it("throws LlmRequestError on empty messages")` test that calls `chatCompletion([])` and expects a `LlmRequestError` throw.

### Success Criteria:

#### Automated Verification:

- `npm test` runs and the smoke test passes
- `npm run lint` passes with the new ESLint overrides
- CI workflow file is valid YAML (checked by `npm run build` in CI)

#### Manual Verification:

- Verify CI pipeline runs the test step on a push/PR (check GitHub Actions output)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Empty-String Guard + LLM Resilience Tests (Risk #1)

### Overview

Add the empty-string guard to `chatCompletion` and write comprehensive unit tests covering the full LLM failure matrix, the guard, pure helper functions, and the digest/weekly error propagation asymmetry.

### Changes Required:

#### 1. Add empty-string guard to chatCompletion

**File**: `src/lib/services/llm.ts`

**Intent**: Treat an empty (or whitespace-only) LLM response as an error, preventing empty digest/weekly bodies from being stored. This closes the highest-value gap identified in research.

**Contract**: After the `completionText(payload)` extraction (current line ~149) and the `text === undefined` check, add a guard that throws `LlmRequestError` when `text.trim().length === 0`. Error message: `"OpenRouter returned an empty completion"`, with `res.status` as the status.

```typescript
if (text.trim().length === 0) {
  throw new LlmRequestError("OpenRouter returned an empty completion", res.status);
}
```

#### 2. LLM unit tests — full failure matrix

**File**: `src/lib/services/llm.test.ts`

**Intent**: Test every row of the chatCompletion failure matrix from the research doc. Each scenario mocks `global.fetch` to return a specific response shape and asserts the correct error type/message.

**Contract**: Test cases covering:
- No API key → `LlmNotConfiguredError`
- Empty messages array → `LlmRequestError("messages must not be empty")`
- Network error (fetch throws) → `LlmRequestError`
- Timeout (AbortError) → `LlmRequestError("OpenRouter request timed out")`
- Non-JSON response body → `LlmRequestError("non-JSON response", status)`
- HTTP 429 rate limit → `LlmRequestError` with status 429
- HTTP 500 server error → `LlmRequestError` with status 500
- 200 + empty choices array → `LlmRequestError("missing completion text")`
- 200 + missing content field → `LlmRequestError("missing completion text")`
- 200 + `content: ""` → `LlmRequestError("empty completion")` (the new guard)
- 200 + `content: "   "` → `LlmRequestError("empty completion")` (whitespace-only)
- 200 + valid text → success `{ text, usage? }`

Each test must mock `global.fetch` via `vi.stubGlobal` or `vi.spyOn` and restore after. Use `beforeEach`/`afterEach` for cleanup.

For the "no API key" test: override the `astro:env/server` mock to return `undefined` for `OPENROUTER_API_KEY` within that test, and pass no `opts.apiKey`.

#### 3. Pure function unit tests

**File**: `src/lib/services/digest.test.ts`

**Intent**: Test `buildUserPrompt` and `truncateNotes` — pure exported functions that are the foundation for both digest and weekly prompt construction.

**Contract**: Test cases for `buildUserPrompt`:
- Single note → formatted output with note header
- Multiple notes → all included in chronological order
- Truncated count > 0 → header includes truncation notice

Test cases for `truncateNotes`:
- Notes within limit → all kept, truncatedCount = 0
- Notes exceeding limit → oldest dropped, truncatedCount reflects dropped count
- Single note exceeding limit → hard-truncated to limit, kept.length = 1

#### 4. Digest service error propagation test

**File**: `src/lib/services/digest.test.ts`

**Intent**: Verify the asymmetric error handling — when `chatCompletion` throws, `generateDigest` lets the error bubble (no try/catch), and no `ai_content` row is inserted.

**Contract**: Mock `chatCompletion` (via `vi.mock("@/lib/services/llm", ...)`) to throw `LlmRequestError`. Mock the Supabase client to track calls. Assert:
- `generateDigest` re-throws the `LlmRequestError`
- `supabase.from("ai_content").insert(...)` was NOT called
- `isLlmConfigured()` returning false → `DigestError` with status 503
- Zero notes found → `DigestError` with status 422

#### 5. Weekly summary error propagation test

**File**: `src/lib/services/weekly-summary.test.ts`

**Intent**: Verify the other side of the asymmetry — when `chatCompletion` throws, `generateWeeklySummaryForUser` catches the error, inserts a `weekly-failed` row, then re-throws.

**Contract**: Mock `chatCompletion` to throw `LlmRequestError`. Mock Supabase client. Assert:
- `generateWeeklySummaryForUser` re-throws the original error
- A `kind: "weekly-failed"` row WAS inserted into `ai_content`
- On LLM success but DB insert failure: `weekly-failed` fallback row is also inserted
- < 3 notes → returns `null` (no LLM call, no DB insert)

### Success Criteria:

#### Automated Verification:

- `npm test` passes — all LLM failure matrix tests green
- `npm run lint` passes (production code change in llm.ts)
- Type checking passes (no new type errors from the guard)

#### Manual Verification:

- Review the empty-string guard placement in `llm.ts` — confirm it fires after `completionText` extraction and before the return statement
- Verify test coverage feels comprehensive against the failure matrix table in the research doc

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Data Isolation + Worker Cron Tests (Risk #2 + Cron Boundary)

### Overview

Write mock-based tests verifying `user_id` scoping in service functions (Risk #2) and worker cron logic — threshold boundaries, per-user error isolation, and idempotency. All tests use mocked Supabase clients, no Docker.

### Changes Required:

#### 1. Supabase mock helper

**File**: `src/lib/services/__tests__/helpers.ts` (new file)

**Intent**: Create a reusable mock Supabase client factory that tracks `.from()`, `.select()`, `.eq()`, `.insert()` calls and returns configurable results. Used across Phase 3 tests.

**Contract**: Exports a `createMockSupabase()` function returning an object that satisfies `SupabaseClient` at the type level (or enough of it for the service calls). Chain methods (`.from().select().eq()...`) return `this` and resolve with configurable `{ data, error }`. Tracks all `.eq("user_id", ...)` calls for assertion.

#### 2. Digest data isolation tests

**File**: `src/lib/services/digest.test.ts` (extend from Phase 2)

**Intent**: Verify that `generateDigest` and internal query functions always scope by `user_id`. A mock configured for User A should never return User B's notes.

**Contract**: Test cases:
- `fetchNotesSinceForTag` includes `.eq("user_id", userAId)` in query chain — mock verifies the call
- `fetchLastDigestForTag` includes `.eq("user_id", userAId)` — mock verifies
- Two-user scenario: mock returns different notes for different user_ids; calling `generateDigest` with User A's ID only processes User A's notes

Since `fetchNotesSinceForTag` and `fetchLastDigestForTag` are internal (not exported), these tests operate through `generateDigest` and assert on the mock's recorded calls.

#### 3. Weekly summary data isolation tests

**File**: `src/lib/services/weekly-summary.test.ts` (extend from Phase 2)

**Intent**: Verify `fetchUserNotesInWindow` and `hasWeeklySummaryInWindow` scope by `user_id`.

**Contract**: Test cases:
- `fetchUserNotesInWindow` includes `.eq("user_id", userId)` — mock verifies
- `hasWeeklySummaryInWindow` includes `.eq("user_id", userId)` — mock verifies
- `generateWeeklySummaryForUser` with User A's data processes only User A's notes

#### 4. Worker cron tests

**File**: `src/worker.test.ts` (new file)

**Intent**: Test `runWeeklySummaries` — the cron entry point. Covers threshold logic, per-user error isolation, idempotency, and missing env var handling. The worker has no `astro:env/server` dependency, making it clean to test.

**Contract**: Mock `createAdminClient` (from `@/lib/supabase-admin`) and `generateWeeklySummaryForUser` + `hasWeeklySummaryInWindow` (from `@/lib/services/weekly-summary`). Test cases:

Threshold boundary:
- 2 notes for a user → user is NOT in `eligibleUserIds`, `generateWeeklySummaryForUser` not called
- 3 notes for a user → user IS eligible, generation called
- 5 notes for a user → user IS eligible

Per-user error isolation:
- User A generation throws, User B generation succeeds → User B's summary is still generated (loop continues)

Idempotency:
- `hasWeeklySummaryInWindow` returns true for User A → `generateWeeklySummaryForUser` is NOT called for User A (skipped)

Missing env vars:
- `env.OPENROUTER_API_KEY` is falsy → function returns early, no queries made

Multiple users:
- 3 eligible users, all succeed → 3 calls to `generateWeeklySummaryForUser`

### Success Criteria:

#### Automated Verification:

- `npm test` passes — all isolation and worker tests green
- `npm run lint` passes
- `npm run build` passes (no production code changes in this phase)

#### Manual Verification:

- Review mock helper — confirm it's reusable and not over-specified (should be a thin wrapper, not a full Supabase reimplementation)
- Verify worker threshold test covers the exact boundary (2 vs 3 notes)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `chatCompletion` failure matrix (12 scenarios) — mock `global.fetch`
- `buildUserPrompt` / `truncateNotes` — pure functions, no mocking needed
- `isLlmConfigured` — trivial, tested as part of digest tests

### Integration Tests (mock-based):

- `generateDigest` error propagation — mock `chatCompletion` + Supabase
- `generateWeeklySummaryForUser` error propagation + `weekly-failed` path — mock `chatCompletion` + Supabase
- Data isolation: user_id scoping in all service queries — mock Supabase, verify `.eq("user_id")` calls
- Worker cron: threshold, isolation, idempotency — mock all service imports

### Manual Testing Steps:

1. Run `npm test` locally — all tests pass
2. Push to a branch — verify CI runs lint + test + build in that order
3. Review the empty-string guard in `llm.ts` — confirm it matches the contract
4. Review test file locations — confirm they mirror source structure

## Performance Considerations

- Tests mock `global.fetch` and Supabase client — no real network calls, fast execution
- No Docker dependency — CI runs without additional services
- Vitest's native ESM support avoids transpilation overhead

## References

- Research: `context/changes/testing-llm-resilience-and-isolation/research.md`
- Test plan: `context/foundation/test-plan.md` (Phase 1)
- LLM failure matrix: research.md §1 (lines 57-78)
- Error asymmetry: research.md §Architecture Insights (lines 224-233)
- Defense-in-depth: research.md §4 (lines 119-147)
- Lessons learned: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test Infrastructure Bootstrap

#### Automated

- [x] 1.1 `npm test` runs and smoke test passes — 084b7ac
- [x] 1.2 `npm run lint` passes with ESLint test overrides — 084b7ac
- [x] 1.3 CI workflow YAML is valid — 084b7ac

#### Manual

- [x] 1.4 CI pipeline runs test step on push/PR — 084b7ac

### Phase 2: Empty-String Guard + LLM Resilience Tests (Risk #1)

#### Automated

- [x] 2.1 `npm test` passes — all LLM failure matrix tests green — 291fdfa
- [x] 2.2 `npm run lint` passes (production code change) — 291fdfa
- [x] 2.3 Type checking passes — 291fdfa

#### Manual

- [x] 2.4 Empty-string guard placement reviewed — 291fdfa
- [x] 2.5 Test coverage reviewed against failure matrix — 291fdfa

### Phase 3: Data Isolation + Worker Cron Tests (Risk #2 + Cron Boundary)

#### Automated

- [x] 3.1 `npm test` passes — all isolation and worker tests green — 889f2a9
- [x] 3.2 `npm run lint` passes — 889f2a9
- [x] 3.3 `npm run build` passes — 889f2a9

#### Manual

- [x] 3.4 Mock helper reviewed for reusability — 889f2a9
- [x] 3.5 Worker threshold boundary test verified (2 vs 3) — 889f2a9
