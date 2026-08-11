---
project: my-notes
researched_at: 2026-08-09
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR) + React 19 islands
  runtime: Cloudflare workerd (via @astrojs/cloudflare ^13.5.0)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Astro 6's `@astrojs/cloudflare` v13.0.0 officially dropped Cloudflare Pages support — Workers is now the only supported deployment target for on-demand rendering. The project already ships with `@astrojs/cloudflare ^13.5.0` and `wrangler ^4.90.0`, so the platform choice matches the stack with zero migration cost. The Workers Free plan covers the MVP's traffic profile (small user base, low QPS, one weekly cron per user), the Paid plan is a flat $5/month if the AI processing outgrows the Free CPU cap, and Cloudflare exposes four official MCP servers (docs, bindings, builds, observability) — the richest agent-facing surface among the candidates.

## Platform Comparison

Hard filters applied: none (Q1 = no persistent connections needed; all six candidates support Astro's server output either natively or via `@astrojs/node`).

Weights applied per interview: cost/DX equal, single region (edge advantage neutralized), external services already chosen (Supabase + OpenRouter — co-location weight low).

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | **5 / 5** |
| Netlify | Pass | Pass | Pass | Pass | Pass | **5 / 5** |
| Vercel | Pass | Pass | Pass | Pass | Pass | **5 / 5** |
| Fly.io | Pass | Partial | Pass | Pass | Partial | 3.5 / 5 |
| Railway | Pass | Pass | Pass | Pass | Partial | 4.5 / 5 |
| Render | Partial | Pass | Pass | Pass | Fail | 3.5 / 5 |

- **Cloudflare Workers** — `wrangler` covers deploy, tail, rollback, secrets, cron; docs published as markdown/`llms.txt`; four official remote MCP servers (`docs.mcp.cloudflare.com`, `bindings.mcp.cloudflare.com`, `builds.mcp.cloudflare.com`, `observability.mcp.cloudflare.com`).
- **Netlify** — `netlify` CLI is complete; docs expose `llms.txt`; official `@netlify/mcp` (npm, remote at `netlify-mcp.netlify.app/mcp`) covers create/deploy/env/access. Scheduled Functions have a 30-second execution limit.
- **Vercel** — `vercel` CLI complete; MCP GA at `mcp.vercel.com` (upgraded to 2026-07-28 spec on Jul 31 2026, one-line install via `npx add-mcp https://mcp.vercel.com`). Hobby-tier caveats detailed below.
- **Fly.io** — `flyctl` is CLI-first, but the model is VM/container-based: you own a Dockerfile, `fly.toml`, and pick a scheduler (Cron Manager or Supercronic). Higher operational surface than the serverless three. No first-party MCP server.
- **Railway** — `railway` CLI complete; docs solid; native cron via service settings (min 5 min interval, best-effort timing). Free plan is $1/mo credit — effectively unusable — Hobby is $5/mo. No first-party MCP.
- **Render** — deploy hooks and API cover the loop but some ops still require the dashboard; **cron jobs have no free tier** ($1/mo minimum per cron, per service); no first-party MCP.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The tech stack picked `@astrojs/cloudflare` before this decision was made, and Astro 6 confirmed the choice by dropping Pages support in the adapter. `astro dev` now runs on `workerd` (adapter 13.x), so local dev is a near-exact production replica. Free plan gives 100 000 requests/day, 5 Cron Triggers/account, 200 000 log events/day (3-day retention) — enough for a 1-to-early-users MVP. Paid is a flat $5/month with 10 M requests/month, 30 million CPU-ms, 250 Cron Triggers, and 20 M log events/month with 7-day retention — the natural upgrade the moment the Free CPU cap becomes limiting.

#### 2. Netlify (Runner-up)

Strongest ergonomics after Cloudflare: first-class Astro adapter, official `@netlify/mcp`, Scheduled Functions on every tier, and a Free plan with 300 credits/month and a hard limit (no surprise bills). The 30-second execution ceiling on Scheduled Functions fits the FR-018 weekly summary trivially. The one MVP concern is the credit-based model: at 5 credits per GB-hour of compute, a chatty AI backend can churn credits faster than intuition expects — worth measuring during MVP week 1.

#### 3. Vercel

Excellent Astro adapter, GA MCP server (`mcp.vercel.com`), production-grade DX. Two Hobby-plan gotchas keep it in third: (a) Hobby is licensed for personal, non-commercial use only — MyNotes as a solo side project qualifies today but graduates to Pro ($20/mo/user) the moment revenue appears; (b) Hobby cron is capped at **once per day** with **±59-minute timing precision**, and any expression firing more than once per day fails at deploy time. FR-018 (weekly summary) technically fits, but the "at least daily-cadence" restriction is a real ceiling.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10 ms CPU cap on Free is a landmine for AI processing.** `JSON.parse` of an LLM response, tokenization, or looping across users in a Monday cron can silently blow past 10 ms. Fine for a single-user MVP; breaks the moment MyNotes has ~10 real users, at which point the $5/month Paid upgrade is not optional.
2. **Not Node.js.** Anything assuming `fs`, `net`, `child_process`, or Node-native binaries won't run. Today's MyNotes (Supabase JS + `fetch` to OpenRouter) is safe, but this closes doors to future features like PDF export, image processing, or Node-only AI SDKs.
3. **Bindings coupling.** `import { env } from 'cloudflare:workers'`, `Astro.locals.cfContext`, and `wrangler.jsonc` are Cloudflare-native. A future migration off Workers is a non-trivial refactor, not an adapter swap.
4. **Cron Triggers are capped per Cloudflare account, not per project.** 5 on Free, 250 on Paid. Solo devs juggling multiple projects on one Cloudflare account share that budget without warning.
5. **Preview deploys require setup.** Not one-click PR previews like Netlify/Vercel. You either enable Workers Builds (Git-connected) or run `wrangler versions upload` from GH Actions on branch/PR pushes. The wiring is real work.

### Pre-Mortem — How This Could Fail

Six months in, MyNotes has 12 signed-up users. The weekly summary cron fires every Monday at 03:00 UTC. On Free Workers, each cron invocation is capped at 10 ms of CPU. The handler enumerates users, fetches ~15 notes each from Supabase, calls OpenRouter for a grounded summary, and writes back. Around week 3, `JSON.parse` of a 6 KB LLM response tips CPU past 10 ms; the cron throws mid-invocation and no summaries land that week — the entire product promise (FR-018 + FR-019, the Primary metric) evaporates for the affected cohort. The developer doesn't notice: Free-tier observability keeps only 3 days of logs, and by Wednesday the errors have rolled off. Meanwhile `astro dev = wrangler dev = workerd`, but local doesn't enforce the 10 ms Free-tier cap, so the failure never reproduces on the laptop. The $5/month Paid plan removes the cap. The bug was ever relying on Free-tier CPU limits for AI processing.

### Unknown Unknowns

- **Astro 6 exclusively supports Cloudflare Workers** (adapter v13 dropped Pages). Any tutorial dated pre-2026 that mentions Pages, `_worker.js` uploads, `wrangler pages dev`, or `Astro.locals.runtime.env` is stale. Filter search results to 2026+.
- **`astro dev` now runs on workerd, not Node.** Local dev is a workerd emulation of production; issues that used to appear only in production now surface locally, but Node-only libraries stop working locally too. Do not `npm install` a Node-only dependency and expect it to work.
- **Wall-clock ≠ CPU time on Free.** I/O-heavy work (waiting on Supabase, OpenRouter) does not accrue CPU. The 10 ms cap is more forgiving than it sounds for network-bound work — but JSON parsing, crypto, base64, and template rendering count directly and are the usual sources of surprise overruns.
- **Cron limits are per Cloudflare account**, not per Worker or project. Free: 5 triggers total across your whole account. Verify against your existing Cloudflare account load.
- **`wrangler.jsonc` is optional until you add a binding.** The adapter auto-generates a default when there are no bindings; the moment you add KV, D1, R2, or Queues, you need to write one — a common tripping point when introducing a first binding.
- **The tech-stack hand-off says `deployment_target: cloudflare-pages`.** That was accurate under Astro 5 / adapter 12 but is superseded by Astro 6 / adapter 13. Treat `cloudflare-workers` as the current deployment target — the running adapter enforces it.

## Operational Story

- **Preview deploys**: two viable paths. (1) **Workers Builds** — connect the GitHub repo in the Cloudflare dashboard once, then every PR gets an ephemeral `*.workers.dev` preview URL automatically. (2) **GH Actions + `wrangler versions upload`** — keeps CI in your repo, but you build the preview URL surfacing yourself. This project already has CI in GH Actions (`.github/workflows/ci.yml`) doing lint + build, so path (2) is the low-friction extension: add a step that runs `wrangler versions upload` on `pull_request` and comments the preview URL. Fork PRs cannot access the `CLOUDFLARE_API_TOKEN` secret — preview deploys will be skipped for external contributors.
- **Secrets**: `SUPABASE_URL`, `SUPABASE_KEY`, and the future `OPENROUTER_API_KEY` live in three places. (1) Local Node dev — `.env` (gitignored). (2) Local wrangler/`workerd` dev — `.dev.vars` (gitignored). (3) Production — `wrangler secret put SUPABASE_KEY` (encrypted at Cloudflare, never printed). Rotation flow: `wrangler secret put …` again with the new value; no redeploy required. GH Actions CI reads production values from `SUPABASE_URL` / `SUPABASE_KEY` repo secrets (see `.github/workflows/ci.yml`).
- **Rollback**: `wrangler rollback` reverts the last deployment (or `wrangler rollback --message="…" <version-id>` for a specific version). Time-to-revert is seconds — no build, just a versioned pointer flip. **Caveat**: Supabase migrations (`supabase/migrations/`) do not roll back with the Worker. A schema change that breaks the previous Worker version must be reverted via a new forward migration, not a rollback.
- **Approval**: fully automated — merges to `master` deploy to production via `wrangler deploy` in CI. Human-required actions: rotating a production secret, running a destructive Supabase migration, and account-level changes (billing tier, new custom domain SSL). An agent may run `wrangler tail`, `wrangler versions list`, `wrangler deployments list`, and preview deploys unattended.
- **Logs**: three read-only agent paths. (1) `wrangler tail` — live stream from the Worker, filterable by status/method. (2) Observability MCP server (`https://observability.mcp.cloudflare.com/mcp`, OAuth) — typed queries via `query_worker_observability`, plus `observability_keys` / `observability_values` for schema discovery; the natural fit for agents. (3) GH Actions logs via `gh run view` for pipeline failures. Free-tier retention is 3 days, Paid is 7 days — the observability MCP calls will silently return empty for older windows.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Weekly summary cron silently fails on Free-tier 10 ms CPU cap once users grow | Pre-Mortem | M | H | Upgrade to Workers Paid ($5/mo) before onboarding the second real user; add a CI-time budget check on `JSON.parse` cost in the scheduled handler; keep 15-min wall-clock ceiling in mind. |
| CPU overrun goes undetected because Free-tier logs retain only 3 days | Pre-Mortem | M | M | Wire a `try/catch` in the cron handler that writes a Supabase `ai_run_failures` row on any error; add a UI surface in "AI dla mnie" that shows the last N failed runs (satisfies FR-018 visibility guardrail). |
| Migration off Cloudflare later requires refactor of env access and bindings | Devil's Advocate | L | M | Keep all Cloudflare-specific imports behind a thin `@/lib/runtime.ts` shim; avoid sprinkling `cloudflare:workers` imports across pages/services. |
| Fork-PR preview deploys blocked by secret access | Research finding | L | L | Document the limitation in `AGENTS.md`; require internal branches for preview deploys; accept the trade-off vs. exposing tokens. |
| Cloudflare account cron budget silently exhausted by another project | Unknown Unknowns | L | M | Design MyNotes to use **one** cron trigger that dispatches to all users; audit the account for existing triggers before first deploy. |
| Node-only dependency inadvertently added (e.g., PDF, image library) breaks Worker build | Devil's Advocate | M | M | Add a lint rule / CI check that fails on `require('fs')`, `require('net')`, or `child_process` imports; document allowed dependency shapes in `AGENTS.md`. |
| Wrangler config drift between `wrangler.jsonc` and adapter defaults when first binding lands | Unknown Unknowns | L | L | On the first binding introduction, generate `wrangler.jsonc` explicitly via `wrangler init --from-dash` or copy the adapter-generated file to disk and commit it. |
| Stale docs (pre-2026 Pages content) mislead future agents | Unknown Unknowns | H | L | Note the Astro 6 / adapter v13 pinning in `AGENTS.md` and add a lesson to `context/foundation/lessons.md` warning against Pages-era guidance. |

## Getting Started

Commands validated against this project's exact versions (`astro ^6.3.1`, `@astrojs/cloudflare ^13.5.0`, `wrangler ^4.90.0`). No CLI or config below is copied from generic tutorials — each item has been checked against the adapter v13 behavior.

1. **Authenticate wrangler once.** `npx wrangler login` opens a browser tab and writes credentials to `~/.wrangler`. From then on, `npx wrangler …` is the deploy/rollback/logs entry point. (`wrangler` is already in `devDependencies`, no global install needed.)
2. **Confirm local dev already runs workerd — do not run `wrangler dev` separately.** From adapter v13.x forward, `npm run dev` (which shells to `astro dev`) starts the app on Cloudflare's `workerd` runtime, not Node. This means bindings (KV, D1, R2), `cloudflare:workers`, and edge-only APIs work locally without a second CLI. Skip any tutorial that tells you to run `wrangler dev` alongside `astro dev` — that pattern predates adapter v13.
3. **Move secrets to the two right places.** Local dev secrets go in `.dev.vars` at repo root (gitignored, format `KEY=value`). Production secrets go via `npx wrangler secret put SUPABASE_KEY` (interactive) and equivalent for `SUPABASE_URL`, and later `OPENROUTER_API_KEY`. Do not commit `.dev.vars`; do not paste secrets into `wrangler.jsonc`.
4. **Ship the first production deploy from the terminal.** `npm run build && npx wrangler deploy` produces a build via `@astrojs/cloudflare` and pushes the Worker. First deploy prompts for the account and workers.dev subdomain — subsequent deploys are non-interactive. Verify with `npx wrangler deployments list`.
5. **Wire CI to deploy on merge to `master`.** Extend `.github/workflows/ci.yml` with a `deploy` job that runs `npx wrangler deploy` behind `if: github.ref == 'refs/heads/master' && github.event_name == 'push'`. It needs a `CLOUDFLARE_API_TOKEN` GitHub secret with **Edit Workers** permission and the existing `SUPABASE_URL` / `SUPABASE_KEY` build secrets. Keep the existing lint + build steps as the pre-condition.
6. **Add the weekly summary Cron Trigger before FR-018 lands.** In `wrangler.jsonc`, add `"triggers": { "crons": ["0 3 * * 1"] }` (Mondays 03:00 UTC). Expose a `scheduled()` handler either by using the adapter's `workerEntryPoint` option to point at a custom Worker entry that re-exports the Astro handler and adds `scheduled`, or by deploying a second, tiny Worker whose sole job is to call an internal Astro API route protected by a shared secret. Prefer the second option for MVP — it keeps concerns separated and does not couple the Astro build to Cloudflare's Worker entry-point shape.
7. **Connect the Cloudflare docs and observability MCP servers in your agent.** `https://docs.mcp.cloudflare.com/mcp`, `https://bindings.mcp.cloudflare.com/mcp`, and `https://observability.mcp.cloudflare.com/mcp` all speak OAuth — connect once from Cursor / Claude Desktop and the agent gets typed access to docs search, KV/D1/R2 management, and Workers logs.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration or containerized runtimes (Workers is a JS-only runtime).
- Full CI/CD pipeline authoring — only the shape of the deploy step was validated. Detailed workflow YAML is downstream of `/10x-implement`.
- Production-scale architecture — multi-region failover, HA, disaster recovery, and dedicated support tiers. The Primary metric and PRD scale (small users, low QPS) do not require them for MVP.
- LLM provider selection — OpenRouter is already listed as the chosen provider in the interview answers; provider comparison and prompt engineering are out of scope for infra research.
- Domain and SSL configuration beyond the default `*.workers.dev` subdomain. Custom domain setup is a one-time dashboard/wrangler flow before public launch.
