# LLM Provider Contract (OpenRouter Integration) — Plan Brief

> Full plan: `context/changes/llm-provider-contract/plan.md`

## What & Why

Stand up the OpenRouter integration foundation (roadmap F-02): a thin, prompt-agnostic LLM client, the `OPENROUTER_API_KEY` secret wired through Astro's typed env schema, and training opt-out enforced at the routing layer. This unblocks S-02 (north-star digest) and S-08 (weekly cron) and definitively resolves PRD Open Question #3 (LLM data hygiene / training opt-out), which was the entire reason F-02 sat `blocked`.

## Starting Point

No LLM code exists (`src/lib/services/` has only `notes.ts`). The env, config-status, and service-throw/route-catch patterns are all established; `.env.example` already lists `OPENROUTER_API_KEY` but the Astro env schema does not. Runtime is Cloudflare workerd (`fetch`-only, 10 ms Free-tier CPU cap).

## Desired End State

`import { chatCompletion, isLlmConfigured } from "@/lib/services/llm"` works: a configured call returns `{ text, usage }` from OpenRouter with `provider: { data_collection: "deny" }` on every request; an unconfigured app still boots, reports OpenRouter in its missing-config surface, and throws `LlmNotConfiguredError` only if called anyway. The opt-out decision is recorded in `AGENTS.md` and proven by a live smoke call.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Training opt-out (OQ#3) | `provider: { data_collection: "deny" }` on every request + account defaults | Enforces the guardrail in auditable code, not just account settings; no special plan needed | Plan |
| `zdr: true`? | No | Would shrink the endpoint pool at MVP scale for little added benefit today | Plan |
| Wrapper shape | Generic `chatCompletion(messages, opts) → { text, usage }` | Reusable by S-02 + S-08; grounded prompt belongs to the north-star slice, not the foundation | Plan |
| Streaming | Deferred to S-02 | A spinner already meets the ≤2s NFR; token streaming is additive later | Plan |
| Default model | Pinned cheap/fast Haiku-class slug, overridable | Fits MVP cost/latency + workerd CPU budget | Plan |
| Error signaling | Throw typed `LlmNotConfiguredError` / `LlmRequestError` + `isLlmConfigured()` guard | Matches services-throw convention + lessons log-before-degrade; separates "off" from "failed" | Plan |
| Config surface | Mirror Supabase in `config-status.ts` | Consistent DX; missing key is visible before runtime | Plan |
| Done bar | Code + config + lint/build/typecheck + one live smoke call | Proves the contract before S-02 depends on it, without over-building | Plan |

## Scope

**In scope:** env-schema field, `config-status.ts` entry, LLM types in `src/types.ts`, the `llm.ts` wrapper (`chatCompletion` + `isLlmConfigured` + typed errors), AGENTS.md decision record, live smoke call.

**Out of scope:** `ai_content` table (S-02), `ai_run_failures` (parked), streaming/SSE, grounded prompt + "AI dla mnie" UI (S-02), cron handler (S-08), multi-provider fallback (parked), any shipped API route, `zdr` enforcement.

## Architecture / Approach

Single thin module: build request body (model, messages, `provider.data_collection: "deny"`) → `fetch` OpenRouter `POST /api/v1/chat/completions` → map non-2xx to a logged `LlmRequestError` → parse once → return `{ text, usage }`. Not-configured is a non-exceptional state via `isLlmConfigured()`; the schema/env change makes the key available through `astro:env/server`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Integration scaffolding | Env field, config-status entry, LLM types, `llm.ts` wrapper | Wrapper signature is a contract S-02/S-08 inherit — get shape right |
| 2. Decision record + live proof | AGENTS.md opt-out record + one live smoke call | `data_collection: "deny"` could exclude the default model's endpoints → verify a compliant endpoint serves it |

**Prerequisites:** an OpenRouter API key available for the Phase 2 live smoke call (in `.dev.vars`). None for Phase 1.
**Estimated effort:** ~1 short session across 2 phases.

## Open Risks & Assumptions

- Assumes a Haiku-class model has endpoints compatible with `data_collection: "deny"` — verified by the Phase 2 smoke call; if not, widen the model or provider order.
- Setting the production secret (`wrangler secret put OPENROUTER_API_KEY`) is part of THIS change's rollout, not deferred — the config-status entry renders a site-wide error banner (`Layout.astro`) until the key is set in each environment.
- workerd 10 ms CPU cap doesn't bite here (single call, network-bound) but will matter in S-08's cron — keep response parsing lean.

## Success Criteria (Summary)

- `chatCompletion` / `isLlmConfigured` importable and type-checked; `npx astro check` + lint + build green.
- Every request enforces `data_collection: "deny"`; a live call returns grounded text.
- Opt-out decision recorded in `AGENTS.md`; unconfigured app still boots and surfaces the missing key.
