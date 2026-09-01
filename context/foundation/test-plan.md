# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-01

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   developer is worried about X, and the failure would surface somewhere in
   \<area\>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluding `node_modules`, `dist`, `context/`, `supabase/`). 30 commits in 30 days — sufficient signal.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user/business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|------------------------|--------|------------|-------------------------------|
| 1 | **LLM response parsing failure** — OpenRouter returns malformed JSON, truncated body, 429, timeout, or unexpected schema; digest or weekly summary generation crashes or writes garbage to the AI content store. | High | High | Interview Q1; PRD Guardrail#3; AGENTS.md LLM rules; hot-spot dir `src/lib/services` — 13 touches/30d |
| 2 | **Cross-user data leakage / IDOR** — RLS policy gap, missing user-scoping in a query, or use of admin client leaks another user's notes, tags, digests, or summaries. | High | Medium | PRD Guardrail#1 ("naruszenie = porażka"); Access Control §Granica danych; F-01 archived; abuse lens — ownership checks |
| 3 | **Digest generation quality regression** — Prompt change or code modification causes wrong notes selected (wrong tag, wrong time window), empty digest, hallucinated content, or cross-user note bleed. | High | High | Interview Q3; PRD Guardrail#3; FR-015; hot-spot dir `src/lib/services` — 13 touches/30d |
| 4 | **Weekly cron silent failure** — Scheduled handler runs but summary generation fails silently: swallowed error, threshold miscalculation (≥3 notes), wrong week window, or CPU cap exceeded. No user-visible error, Free-tier logs expire in 3 days. | High | Medium | PRD US-01, FR-018; Roadmap S-08 Risk section; hot-spot dir `src/` — `worker.ts` 3 touches/30d |
| 5 | **Note data loss on edit/delete** — Inline edit appears to save but DB write fails silently (RLS rejection, network error); hard delete fires without confirmation; optimistic UI masks a failed mutation. | High | Low | PRD Guardrail#2 ("notatka nigdy nie ginie"); FR-006/007/008; hot-spot dir `src/components/notes` — 14 touches/30d |
| 6 | **Auth flow regression** — OAuth callback, session cookie exchange, or middleware redirect breaks; users locked out or unauthenticated users bypass protected route gate. | High | Medium | PRD FR-001/002/003; Access Control; hot-spot dir `src/pages/auth` — 8 touches/30d; S-07 recently shipped |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | When OpenRouter returns malformed JSON, empty body, 429, timeout, or missing fields, the system does not crash, does not store garbage, and surfaces an error state. | "If fetch returns 200, the response body is valid" — 200 with truncated JSON, empty choices array, or missing content field is a real failure mode. | How `chatCompletion` parses/validates the response; how errors propagate to digest and weekly-summary services; what gets written on failure vs success. | Unit test (mock LLM responses with various failure shapes). | Happy-path-only testing; missing truncated JSON, empty choices, rate-limit body, timeout scenarios. |
| #2 | A query or API call with User A's session never returns User B's resources — even when explicitly passing User B's IDs in the request. | "RLS is enabled therefore isolation is guaranteed" — a missing user_id clause, use of admin client, or a new table without RLS bypasses isolation silently. | Which Supabase client (user vs admin) each service uses; RLS policies on all tables (notes, tags, note_tags, ai_content); whether API routes consistently scope by authenticated user. | Integration test (two users, verify positive access + negative isolation). | Testing only "user A sees own data" without testing "user A cannot see user B's data." |
| #3 | Given notes under tag X, digest uses only those notes from the correct time window, produces a non-empty grounded summary, excludes notes from other tags/users, and handles "no new notes" by informing, not fabricating. | "The prompt produces good output" — the test must verify the flow's behavior (note selection, window, source scoping), not judge LLM prose quality. | How the digest service selects source notes (time window, tag filter); prompt construction contract; response handling; what gets persisted in ai_content. | Integration test with mocked LLM (verify note selection, prompt shape, response handling). | Asserting on LLM output text (fragile, non-deterministic); testing only the happy path with many notes; ignoring "no new notes since last digest" edge. |
| #4 | When cron fires: ≥3 notes in 7 days → summary generated; <3 notes → no summary created; LLM failure → failure recorded, not silently swallowed. | "If the handler runs, the summary appears" — handler may return success while generation inside silently fails (swallowed catch, wrong user loop, threshold off-by-one). | How the scheduled handler dispatches; user iteration logic; threshold implementation (≥3); error recording path (kind='weekly-failed' or equivalent). | Integration test (mock cron context, verify threshold boundaries and error recording). | Testing only the golden path (3+ notes, LLM succeeds); missing threshold boundary (2 vs 3 notes) and partial-failure (user 1 OK, user 2 fails). |
| #5 | After PATCH, note content + tags are persisted and retrievable. After DELETE, note is gone. A failed DB write does not leave the client consuming stale state. | "If API returns 200, data is saved" — RLS-rejected write may not surface as a user-facing error; optimistic UI may mask a failed mutation. | API route handlers for notes CRUD (POST, PATCH, DELETE); error propagation from Supabase to API response; how the notes service handles failures. | Integration test (API → DB roundtrip). | Asserting only on HTTP status without verifying DB state; happy-path-only coverage. |
| #6 | OAuth callback creates/resolves session; middleware identifies authed vs unauthed; protected routes redirect unauthed; signout invalidates session. | "OAuth works because Google handles it" — callback, cookie exchange, and middleware resolution are all app code that break independently of the provider. | Callback handler flow; Supabase client session setup; middleware user resolution + PROTECTED_ROUTES list; signout endpoint behavior. | Integration test (mock Supabase auth responses, verify middleware behavior). | Testing only "logged-in user sees dashboard"; missing "unauthed user redirected" and "expired/malformed session rejected." |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|-----------|-----------------|---------------|------------|--------|---------------|
| 1 | Test runner bootstrap + LLM resilience | Set up Vitest; prove LLM integration survives corrupt responses and data isolation holds at API level. | #1, #2 | unit + integration | change opened | context/changes/testing-llm-resilience-and-isolation/ |
| 2 | AI generation flow coverage | Prove digest and weekly summary flows select the right notes, respect time windows/thresholds, and record failures. | #3, #4 | integration (mocked LLM) | not started | — |
| 3 | Auth and CRUD durability | Prove auth flow doesn't regress and note CRUD persists correctly end-to-end. | #5, #6 | integration | not started | — |
| 4 | Quality gates wiring | Add `npm test` to CI, update AGENTS.md with test cookbook, lock the floor. | cross-cutting | CI gate + documentation | not started | — |

## 4. Stack

The test base for this project. No test runner exists today — Phase 1 bootstraps it.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | none yet — see §3 Phase 1 | Natural fit for Vite-based Astro project; runs in Node with workerd-compatible mocking. |
| API/LLM mocking | Vitest built-in mocks (vi.mock / vi.fn) | — | Mock at the network edge (LLM fetch, Supabase client). No MSW needed at MVP scale. |
| e2e | none | — | Not planned for MVP rollout (user: "no overinvesting in infrastructure"). Revisit if critical-path regressions escape integration tests. |
| accessibility | none | — | Out of scope per interview Q5 (no UI testing budget). |

**Stack grounding tools (current session):**
- Docs: none — no Context7 or framework docs MCP available in current session; checked: 2026-09-01
- Search: WebSearch built-in — can validate tool versions and support; checked: 2026-09-01
- Runtime/browser: cursor-ide-browser MCP available — possible future e2e verification layer, not used in this rollout; checked: 2026-09-01
- Provider/platform: none — no GitHub/Cloudflare/Supabase MCPs available; checked: 2026-09-01

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift |
| pre-commit eslint --fix + prettier | local (husky) | required (already wired) | formatting / lint regressions at commit time |
| unit + integration tests | local + CI | required after §3 Phase 1 | logic regressions, LLM error handling, data isolation |
| `npm test` in CI | GitHub Actions | required after §3 Phase 4 | prevents merging broken code |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase \<N\>."

### 6.1 Adding a unit test

TBD — see §3 Phase 1 (LLM response parsing, error handling patterns).

### 6.2 Adding an integration test

TBD — see §3 Phase 1 (data isolation, API roundtrip patterns).

### 6.3 Adding a test for a new API endpoint

TBD — see §3 Phase 2 (digest/weekly-summary endpoint patterns with mocked LLM).

### 6.4 Adding a test for the AI generation flow

TBD — see §3 Phase 2 (note selection, threshold, prompt contract patterns).

### 6.5 Adding a test for auth/middleware behavior

TBD — see §3 Phase 3 (OAuth callback, session resolution, route gating patterns).

### 6.6 Per-rollout-phase notes

(After each phase lands, the final sub-phase appends a 2–3 line note
here capturing anything surprising the rollout taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI component rendering** — no React component snapshot or render tests. The product value is in behavior and data flow, not in pixel output. Re-evaluate if a UI regression escapes to production and costs real users. (Source: interview Q5.)
- **Configuration files** — no tests for `astro.config.mjs`, `wrangler.jsonc`, `eslint.config.js`, etc. These are validated by the tools that consume them (`npm run build`, `npm run lint`). Re-evaluate if a config change causes a silent production regression. (Source: interview Q5.)
- **Heavy infrastructure / e2e** — no Playwright, no browser automation, no multi-service integration tests. The blast radius at MVP scale (solo user, small data) does not justify the setup and maintenance cost. Re-evaluate post-MVP if user count or data volume grows. (Source: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-01
- Stack versions last verified: 2026-09-01
- AI-native tool references last verified: 2026-09-01

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
