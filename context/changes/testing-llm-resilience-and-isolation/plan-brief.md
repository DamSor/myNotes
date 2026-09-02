# Testing LLM Resilience and Data Isolation — Plan Brief

> Full plan: `context/changes/testing-llm-resilience-and-isolation/plan.md`
> Research: `context/changes/testing-llm-resilience-and-isolation/research.md`

## What & Why

Bootstrap the project's first test suite (Vitest) to cover two critical risks: LLM response resilience (malformed/empty/error responses from OpenRouter crashing or storing garbage) and cross-user data isolation (user_id scoping failures leaking data across accounts). These are Risks #1 and #2 from the test plan — the highest-impact failure scenarios for the MVP.

## Starting Point

Zero test infrastructure exists — no runner, no test files, no CI test step. The LLM layer (`chatCompletion` in `llm.ts`) has a known gap: it accepts `content: ""` as valid success, which would store empty digest/weekly bodies. Error handling is asymmetric between digest (errors bubble, no DB row) and weekly summary (errors caught, `weekly-failed` row persisted). Defense-in-depth for data isolation is solid (RLS + explicit `user_id` + composite FKs) but untested.

## Desired End State

`npm test` runs a Vitest suite that passes locally and in CI. Every failure mode in the LLM failure matrix has a test. An empty-string guard in `chatCompletion` prevents storing empty AI content. Service functions are verified to always scope queries by `user_id`. Worker cron logic is tested for threshold boundaries, per-user error isolation, and idempotency.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Empty-string response handling | Add guard in `chatCompletion` | Centralized fix protects all callers; current behavior is a bug, not intentional. | Plan |
| Guard location | `chatCompletion` (not callers) | One guard at the LLM layer prevents every caller from needing their own empty check. | Plan |
| Worker test scope | Include in Phase 1 | Worker covers both Risk #1 (LLM errors in cron) and Risk #2 (admin client isolation) at a critical boundary. | Plan |
| DB test strategy | Mock Supabase client | Faster, no Docker dependency; sufficient for verifying user_id scoping at the service level. | Plan |
| `ai_content` RLS pattern | Accept bare `auth.uid()` as-is | Functionally equivalent; hardening migration deferred (not a Phase 1 priority). | Plan |
| Test file organization | Mirror source structure | Convention-consistent; each source module has a co-located `.test.ts` file. | Plan |
| CI wiring | Wire `npm test` now (not Phase 4) | Prevents regressions immediately rather than waiting for a future phase. | Plan |

## Scope

**In scope:**
- Vitest setup (config, path aliases, `astro:env/server` mock, ESLint overrides)
- Empty-string guard in `chatCompletion` (production code change)
- LLM failure matrix unit tests (12 scenarios)
- Pure function tests (`buildUserPrompt`, `truncateNotes`)
- Digest/weekly error propagation tests (asymmetry)
- Data isolation tests (mock-based `user_id` scoping verification)
- Worker cron tests (threshold, per-user isolation, idempotency)
- CI `npm test` step in GitHub Actions

**Out of scope:**
- Docker / local Supabase (real RLS tests)
- `ai_content` RLS hardening migration
- API route handler tests (Astro `APIContext` mocking — Phase 3 of test plan)
- E2e / browser tests
- LLM output quality assertions

## Architecture / Approach

Tests mock at two boundaries: `global.fetch` for LLM calls and the Supabase client object for DB operations. A global setup file (`src/test-setup.ts`) handles the `astro:env/server` virtual module mock. Test files mirror source structure (`src/lib/services/llm.test.ts`, etc.). The worker test mocks its service-layer imports directly since it uses DI (no `astro:env/server`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Test Infrastructure Bootstrap | Vitest running, CI wired, `astro:env/server` mocked, smoke test green | Path alias or virtual module mock misconfiguration blocks all subsequent work |
| 2. Empty-String Guard + LLM Resilience | Guard in production code, 12-scenario failure matrix tested, error propagation asymmetry verified | Guard placement must be after text extraction but before return — wrong position breaks valid responses |
| 3. Data Isolation + Worker Cron | `user_id` scoping verified in all services, worker threshold/isolation/idempotency tested | Over-specified mocks couple tests to Supabase query builder internals, making them brittle |

**Prerequisites:** Node.js 22.14.0, npm, working `npm run lint` and `npm run build`
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- `astro:env/server` mock may need adjustment if Vitest's virtual module resolution changes in future versions
- Supabase client mocks verify call patterns (`.eq("user_id", ...)`) but not actual SQL execution — real RLS validation deferred to a later phase
- The empty-string guard uses `text.trim().length === 0` — assumes whitespace-only responses are also invalid (confirmed by user decision)

## Success Criteria (Summary)

- `npm test` passes locally and in CI with all tests green
- The LLM failure matrix from the research doc has 1:1 test coverage
- No service function can be called without `user_id` scoping verified by a test
