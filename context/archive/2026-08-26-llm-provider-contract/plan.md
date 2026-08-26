# LLM Provider Contract (OpenRouter Integration) Implementation Plan

## Overview

Stand up the OpenRouter integration **foundation** (roadmap F-02): a thin, prompt-agnostic LLM client at `src/lib/services/llm.ts`, the `OPENROUTER_API_KEY` secret wired through Astro's typed env schema, training opt-out enforced at the routing layer, and the opt-out decision recorded in `AGENTS.md`. This unblocks S-02 (`first-ai-digest-on-click`, north star) and S-08 (`weekly-summary-cron`) without building any AI-facing feature. It also definitively resolves PRD Open Question #3 (LLM data hygiene / training opt-out).

## Current State Analysis

- **No LLM code exists.** `src/lib/services/` contains only `notes.ts`. `Glob src/lib/**/*.ts` → `validation/notes.ts`, `services/notes.ts`, `config-status.ts`, `http.ts`, `supabase.ts`, `utils.ts`.
- **Env pattern is fixed and typed.** `astro.config.mjs:17-22` declares secrets via `envField.string({ context: "server", access: "secret", optional: true })`, consumed with `import { X } from "astro:env/server"` (see `src/lib/supabase.ts:3`, `src/lib/config-status.ts:1`). `OPENROUTER_API_KEY` is **not** yet in the schema.
- **`.env.example` already lists the key** (`.env.example:3` → `OPENROUTER_API_KEY=###`). `.dev.vars` (local workerd dev) and production (`wrangler secret put`) are the other two locations per `infrastructure.md` §Operational Story / §Getting Started #3.
- **Config-surfacing pattern exists.** `config-status.ts` exports a `configStatuses: ConfigStatus[]` array + `missingConfigs`; today it has a single Supabase entry. Mirror it for OpenRouter.
- **Services throw; routes catch.** `notes.ts` functions `throw new Error(...)` on failure; API routes wrap calls in try/catch and return a JSON envelope (`src/pages/api/notes.ts:34-41`). `lessons.md` codifies both (JSON error envelope on every path; log-before-degrade in partial-success catches).
- **`createClient()` returns `null` when unconfigured** (`supabase.ts:6-8`) — the precedent for representing "service turned off" as a non-exceptional state, which the `isLlmConfigured()` guard follows.
- **Runtime = Cloudflare workerd.** `fetch` only; no Node built-ins (`infrastructure.md` §Devil's Advocate #2, §Unknown Unknowns). OpenRouter's REST `POST /api/v1/chat/completions` fits. CPU is I/O-bound here (network wait doesn't accrue CPU), but `JSON.parse` of the response does — keep parsing lean (`infrastructure.md` §Pre-Mortem, `wrangler.jsonc` tripwires).
- **OpenRouter data-policy facts (verified against current docs):** prompt logging and "OpenRouter use of inputs/outputs" are **off by default**; per-request `provider: { data_collection: "deny" }` restricts routing to endpoints that do **not** store or train on inputs; `zdr: true` would additionally require Zero Data Retention (deliberately NOT used — it shrinks the endpoint pool). Opt-out is therefore a routing-layer + account-settings concern, **not** a special paid plan.

## Desired End State

- `import { chatCompletion, isLlmConfigured } from "@/lib/services/llm"` works and type-checks.
- A call with a valid `OPENROUTER_API_KEY` returns `{ text, usage }` from an OpenRouter chat completion; every request carries `provider: { data_collection: "deny" }`.
- With the key absent, `isLlmConfigured()` returns `false` and `chatCompletion(...)` throws `LlmNotConfiguredError`; the app still boots and all non-AI features work (optional-secret pattern preserved).
- The dashboard's missing-config surface lists OpenRouter when the key is absent (same mechanism as Supabase).
- `AGENTS.md` documents the training-opt-out decision and the LLM wrapper conventions.
- **Verified:** `npx astro check` (type-check), `npm run lint`, and `npm run build` pass; one manual live smoke call in dev returns grounded text and confirms `data_collection: "deny"` routing.

### Key Discoveries:

- Env schema is the single source of truth for secrets — `astro.config.mjs:17-22` (add the field here, not just `.env.example`).
- Config-status array pattern to mirror — `src/lib/config-status.ts:11-21`.
- Service-throw + route-catch convention — `src/lib/services/notes.ts`, `src/pages/api/notes.ts:34-41`, `context/foundation/lessons.md`.
- workerd = `fetch`-only, watch `JSON.parse` CPU — `context/foundation/infrastructure.md` §Pre-Mortem; `wrangler.jsonc:3-13` tripwires.
- OpenRouter recommends `HTTP-Referer` + `X-Title` headers for attribution (optional but low-cost; include them).

## What We're NOT Doing

- **No `ai_content` table** — owned by S-02 (roadmap S-02 Risk line).
- **No `ai_run_failures` table / UI surface** — parked (roadmap §Parked; `infrastructure.md` risk register).
- **No streaming / SSE** — deferred to S-02's UX.
- **No grounded-digest prompt, no note formatting, no "AI dla mnie" UI** — S-02 owns the prompt experiment; this wrapper is prompt-agnostic.
- **No cron / scheduled handler** — S-08.
- **No multi-provider fallback** — parked (roadmap §Parked).
- **No new API route** — the wrapper is a library; the smoke test is a throwaway dev call, not a shipped endpoint.
- **No `zdr: true`** — deliberately excluded to avoid shrinking the endpoint pool at MVP scale (revisit if compliance demands it).

## Implementation Approach

Two phases. Phase 1 builds all code + config (env schema, config-status, shared types, the `llm.ts` wrapper). Phase 2 records the opt-out decision in `AGENTS.md` and proves the integration with one manual live call. The wrapper is a thin pass-through: build the request body (model, messages, `provider.data_collection: "deny"`), `fetch` OpenRouter, map non-2xx to a typed error (log before throw), parse the completion, return `{ text, usage }`. Not-configured is a first-class non-exceptional state via `isLlmConfigured()`; actual failures throw typed errors so callers control the durability guardrail.

## Critical Implementation Details

- **Opt-out is enforced in code, not just the account.** Every request body MUST include `provider: { data_collection: "deny" }`. This is the auditable, drift-proof half of the Guardrail #3 / OQ#3 resolution; the account privacy defaults (logging off, training off) are the backing layer documented in AGENTS.md. Do not make this field caller-optional. If `data_collection: "deny"` leaves the default model with no eligible endpoint (request fails with "no allowed providers"), the fix is to pick a different default slug or set `provider.order` — **never** relax `data_collection` to satisfy the guardrail.
- **workerd CPU caveat.** Keep response handling lean — a single `await res.json()` and direct field access. Avoid extra passes over large payloads (`infrastructure.md` §Pre-Mortem; `wrangler.jsonc` tripwire #1).
- **Not-configured vs failure are distinct.** `isLlmConfigured()` (boolean, cheap, mirrors `missingConfigs`) lets callers/UI branch without a try/catch; `LlmNotConfiguredError` is only thrown if `chatCompletion` is called anyway. `LlmRequestError` should carry enough context (status, provider message) for observability, and MUST be logged before it propagates (`lessons.md` log-before-degrade).

## Phase 1: Integration scaffolding

### Overview

Wire the secret through the typed env schema, surface its config state, define shared LLM types, and build the thin `llm.ts` wrapper.

### Changes Required:

#### 1. Env schema

**File**: `astro.config.mjs`

**Intent**: Register `OPENROUTER_API_KEY` so it's available via `astro:env/server`, consistent with the two Supabase secrets. Keep it optional so the app still boots without AI configured.

**Contract**: Add to `env.schema`: `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })`.

#### 2. Config status surface

**File**: `src/lib/config-status.ts`

**Intent**: Add an OpenRouter entry to `configStatuses` so a missing key shows up in the existing missing-config UI surface, mirroring the Supabase row.

**Contract**: Import `OPENROUTER_API_KEY` from `astro:env/server`; push a `ConfigStatus` with `configured: Boolean(OPENROUTER_API_KEY)` and a Polish message consistent with the existing entry's tone (AI features disabled when unconfigured).

**Blast-radius note**: `missingConfigs` renders a site-wide red `<Banner variant="error">` on every page via `src/layouts/Layout.astro:22-37`. So an unset `OPENROUTER_API_KEY` produces an "AI not configured" banner for all users in every environment — including production. This couples the change to secret provisioning: the production secret MUST be set as part of this change's rollout (see Migration Notes), not deferred, or end-users see an error about a feature that doesn't exist yet. This is consistent with `change.md`'s stated outcome ("`OPENROUTER_API_KEY` w produkcji").

#### 3. Shared LLM types

**File**: `src/types.ts`

**Intent**: Define the wrapper's public shapes so S-02/S-08 consume a stable contract.

**Contract**: Add `LlmMessage` (`role: "system" | "user" | "assistant"`, `content: string`), `LlmCompletionOptions` (optional `model`, `temperature`, `maxTokens`), and `LlmCompletion` (`text: string`, `usage?: { promptTokens; completionTokens; totalTokens }`). Names/casing follow existing camelCase DTO conventions in this file.

#### 4. Thin OpenRouter wrapper

**File**: `src/lib/services/llm.ts` (new)

**Intent**: Provide `isLlmConfigured()` and `chatCompletion(messages, opts)` — a prompt-agnostic client that calls OpenRouter's chat-completions endpoint with training opt-out enforced, returning normalized `{ text, usage }`. Define the typed error classes here.

**Contract**:
- `export function isLlmConfigured(): boolean` — `Boolean(OPENROUTER_API_KEY)` (import from `astro:env/server`).
- `export class LlmNotConfiguredError extends Error` and `export class LlmRequestError extends Error` (the latter carries `status?: number` and the provider error message).
- `export async function chatCompletion(messages: LlmMessage[], opts?: LlmCompletionOptions): Promise<LlmCompletion>`.
- Behavior: throw `LlmNotConfiguredError` if not configured; `POST https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <key>`, `Content-Type: application/json`, and attribution headers `HTTP-Referer` / `X-Title`; body `{ model: opts?.model ?? DEFAULT_LLM_MODEL, messages, temperature?, max_tokens?, provider: { data_collection: "deny" } }`; on non-2xx, `console.error` then throw `LlmRequestError` (with status + parsed provider message); on success, return `{ text: choices[0].message.content, usage: {...} }`.
- `const DEFAULT_LLM_MODEL` — pin one cheap/fast Anthropic Haiku-class slug (verify the current slug against `openrouter.ai/models` at implementation, e.g. `anthropic/claude-3.5-haiku`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check` (`@astrojs/check` is already a dependency; `astro build` alone does not fail on `.ts` type errors)
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- With no `OPENROUTER_API_KEY` set, `npm run dev` boots and existing pages/auth work; the dashboard missing-config surface lists OpenRouter.
- `isLlmConfigured()` returns `false` without the key and `true` once it's set in `.dev.vars`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Decision record + live proof

### Overview

Record the training-opt-out decision and OpenRouter conventions in `AGENTS.md`, then prove the integration with one manual live smoke call.

### Changes Required:

#### 1. Document the opt-out decision + LLM conventions

**File**: `AGENTS.md`

**Intent**: Persist the OQ#3 resolution and the wrapper conventions so future agents don't re-litigate it. This is the roadmap-mandated "decyzja o training-opt-out zapisana w AGENTS.md".

**Contract**: Add a short subsection (e.g. under Hard Rules or a new "LLM / AI" heading) stating: OpenRouter is the provider; training opt-out is enforced two ways — (1) in code, every request sends `provider: { data_collection: "deny" }`, and (2) at the account, prompt logging + "use of inputs/outputs" stay OFF (both default-off); `zdr` is intentionally not enforced at MVP; all LLM calls go through `src/lib/services/llm.ts` (no ad-hoc `fetch` to providers); default model is the pinned Haiku-class constant; workerd = `fetch`-only, keep response parsing lean.

#### 2. Live smoke call (throwaway, not committed)

**File**: — (manual dev action; no shipped code)

**Intent**: Prove auth + `data_collection: "deny"` routing work end-to-end before S-02 depends on the wrapper.

**Contract**: With a real `OPENROUTER_API_KEY` in `.dev.vars`, invoke `chatCompletion([{ role: "user", content: "..." }])` once from a **temporary** server-rendered `.astro` page (or a temporary API route) hit in `npm run dev`, and confirm it returns non-empty text; confirm the request succeeds with `data_collection: "deny"` present (i.e. a compliant endpoint served it). This is the sanctioned throwaway exception to "no new API route" — **delete the temporary page/route after verifying**. Note: a standalone Node script will NOT work — the wrapper imports `astro:env/server`, an Astro virtual module resolvable only inside the Astro/workerd runtime, so the smoke call must run in the dev server.

### Success Criteria:

#### Automated Verification:

- Linting passes after doc edits: `npm run lint`
- Build still succeeds: `npm run build`

#### Manual Verification:

- A live `chatCompletion` call with a real key returns non-empty text.
- The call succeeds with `provider: { data_collection: "deny" }` in the request (no "no allowed providers" error), confirming opt-out routing is compatible with the default model.
- Forcing an error (e.g. bad key) yields a logged `LlmRequestError`, not an unhandled crash.
- `AGENTS.md` states the opt-out decision unambiguously.
- Production secret set via `npx wrangler secret put OPENROUTER_API_KEY`, so the site-wide config-status error banner is absent in production (F2 coupling).

**Implementation Note**: After automated verification passes, pause for manual confirmation that the live smoke call succeeded.

---

## Testing Strategy

No automated test runner is configured (`AGENTS.md`). Verification = type-check (`npx astro check`) + lint (`npm run lint`) + build (`npm run build`) (automated) and the dev smoke call (manual).

### Manual Testing Steps:

1. Without the key: `npm run dev`, confirm boot + OpenRouter shows in missing-config surface + `isLlmConfigured()` is `false`.
2. Add `OPENROUTER_API_KEY` to `.dev.vars`; confirm `isLlmConfigured()` is `true`.
3. Run one `chatCompletion` call; confirm non-empty text and success with `data_collection: "deny"`.
4. Temporarily use a bad key; confirm a logged `LlmRequestError` (no unhandled 500/crash).

## Performance Considerations

LLM calls are network-bound (no CPU accrual while awaiting on workerd), but `JSON.parse` of the response counts against the 10 ms Free-tier CPU cap. Keep response handling to a single parse + direct field access. This wrapper is the shared choke point the `wrangler.jsonc` tripwires reference; S-08's cron is where the cap actually bites.

## Migration Notes

Setting the production secret is part of **this** change's rollout, not deferred to S-02: run `npx wrangler secret put OPENROUTER_API_KEY` (per `infrastructure.md` §Getting Started #3) when this change deploys. This is required by both `change.md`'s outcome ("`OPENROUTER_API_KEY` w produkcji") and the F2 blast-radius coupling — the config-status banner (Phase 1 change #2) shows a site-wide error for all users until the key is set in each deployed environment. Also add it to `.dev.vars` for local dev. No schema/data migration in this change.

## References

- Change: `context/changes/llm-provider-contract/change.md`
- Roadmap item: `context/foundation/roadmap.md` → F-02 (`llm-provider-contract`)
- Infra (secrets, workerd, CPU cap): `context/foundation/infrastructure.md`
- Env pattern: `astro.config.mjs:17-22`, `src/lib/supabase.ts:3`
- Config-status pattern: `src/lib/config-status.ts:11-21`
- Service/route conventions: `src/lib/services/notes.ts`, `src/pages/api/notes.ts:34-41`, `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration scaffolding

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — 6b855d1
- [x] 1.2 Linting passes: `npm run lint` — 6b855d1
- [x] 1.3 Production build succeeds: `npm run build` — 6b855d1

#### Manual

- [x] 1.4 App boots without the key; OpenRouter listed in missing-config surface — 6b855d1
- [x] 1.5 `isLlmConfigured()` false without key, true once set in `.dev.vars` — 6b855d1

### Phase 2: Decision record + live proof

#### Automated

- [x] 2.1 Linting passes after doc edits: `npm run lint` — 0cc2227
- [x] 2.2 Build still succeeds: `npm run build` — 0cc2227

#### Manual

- [x] 2.3 Live `chatCompletion` call returns non-empty text — 0cc2227
- [x] 2.4 Call succeeds with `provider: { data_collection: "deny" }` present — 0cc2227
- [x] 2.5 Bad key yields a logged `LlmRequestError`, no unhandled crash — 0cc2227
- [x] 2.6 `AGENTS.md` states the opt-out decision unambiguously — 0cc2227
- [x] 2.7 Production secret set (`wrangler secret put`); config-status banner absent in prod — 0cc2227
