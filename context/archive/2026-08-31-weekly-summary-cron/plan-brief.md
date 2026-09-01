# Weekly Summary Cron — Plan Brief

> Full plan: `context/changes/weekly-summary-cron/plan.md`

## What & Why

Wire a Monday 03:00 UTC Cloudflare Cron Trigger that automatically generates AI-powered weekly summaries for users who wrote ≥3 notes in the past 7 days. This is the second half of the Primary Success Criterion — proving that MyNotes can "come back to the user with aggregations" without manual action (US-01, FR-018, FR-019).

## Starting Point

The `ai_content` table already supports `kind: 'weekly'` (CHECK constraint + nullable `source_tag_id`), but nothing inserts weekly entries. The per-tag digest generation flow is mature (`src/lib/services/digest.ts`) and provides the pattern: prompt → LLM → insert. No cron infrastructure exists — no custom Worker entry, no triggers, no scheduled handler. The Supabase client is cookie-based and cannot authenticate in a cron context.

## Desired End State

Every Monday at 03:00 UTC, eligible users find a new "Weekly" entry in their `/ai` section — a grounded, 4-section summary of their week's notes. Failed generations show a dismissible warning entry. The system is idempotent (no duplicates on re-run) and resilient (one user's failure doesn't block others).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Cron handler architecture | Custom `src/worker.ts` re-exporting Astro + `scheduled()` | Single deployment unit; adapter v13 supports it natively via `@astrojs/cloudflare/handler`. | Plan |
| Supabase auth in cron | Service role key (bypasses RLS) | No user cookies available in scheduled context; admin access needed to enumerate all users. | Plan |
| User iteration | Sequential (await each LLM call) | Keeps CPU usage predictable under Free-tier 10 ms cap; I/O wait doesn't count. | Plan |
| Prompt format | Same 4 sections as digests | Consistent mental model across all AI-generated content. | Plan |
| Error handling | `kind='weekly-failed'` in `ai_content` | Reuses existing table; provides user-visible failure history; zero migration effort for new table. | Plan |
| UI display | Mixed chronological list with type badges | Unified "AI for me" section; users see all AI content in one stream. | Plan |
| Week window | Rolling 7 days from cron fire time | Simple, no timezone issues, no calendar-week alignment needed. | Plan |
| Idempotency | Skip user if weekly/weekly-failed exists in window | Prevents duplicates on re-run or crash recovery. | Plan |

## Scope

**In scope:**
- Custom Worker entry point with `scheduled()` handler
- Cron trigger (`0 3 * * 1`) in `wrangler.jsonc`
- Admin Supabase client (service role key)
- Weekly summary generation service (cross-tag, 7-day, ≥3 threshold)
- `weekly-failed` kind for error visibility
- `/ai` page: mixed list, type badges, warning style for failures
- `SUPABASE_SERVICE_ROLE_KEY` env var registration

**Out of scope:**
- `ai_run_failures` table (using `weekly-failed` kind instead)
- Retry mechanism, manual trigger UI, per-user timezones
- Paid-tier upgrade (documented as tripwire only)
- Streaming/SSE, mobile UI

## Architecture / Approach

```
Cloudflare Cron (Mon 03:00 UTC)
  → scheduled(controller, env, ctx)
    → createAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    → query eligible users (notes ≥3 in 7d window)
    → for each user (sequential):
        → idempotency check (skip if weekly exists)
        → fetchUserNotesInWindow → truncate → LLM prompt → insert kind='weekly'
        → on error: insert kind='weekly-failed', continue
```

The service reuses `truncateNotes()` and `buildUserPrompt()` from `digest.ts`. The LLM wrapper gets an optional `apiKey` parameter for scheduled-context use.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Infrastructure & Schema | Worker entry, cron trigger, admin client, `weekly-failed` migration | Entry point swap could regress existing fetch handling |
| 2. Weekly Summary Service | Generation service, shared helpers, LLM apiKey extension | Prompt quality / grounding for cross-tag scope |
| 3. Scheduled Handler Orchestration | User enumeration, sequential processing, idempotency, error isolation | Free-tier CPU cap on multi-user iteration |
| 4. UI Updates | Mixed list, type badges, warning style for failures | Visual regression in existing digest cards |

**Prerequisites:** F-01 (done), F-02 (done), S-01 (done). `SUPABASE_SERVICE_ROLE_KEY` must be provisioned in `.dev.vars` and production (`wrangler secret put`).
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- Free-tier CPU cap (10 ms) is assumed sufficient for MVP scale (single user). Multi-user growth requires Workers Paid ($5/mo).
- `astro:env/server` may not be initialized in `scheduled()` context — mitigated by passing env values explicitly from handler.
- Prompt quality for cross-tag weekly summaries is untested — first generated summary should be reviewed for grounding fidelity.
- 3-day Free-tier log retention means cron failures disappear by Wednesday — mitigated by `kind='weekly-failed'` persistence.

## Success Criteria (Summary)

- Weekly summary auto-generated on Monday for users with ≥3 notes in past 7 days
- Summary visible in `/ai` with "Weekly" badge, grounded in user's notes (same guardrails as digests)
- Failed generations produce a user-visible, dismissible warning entry
- No regression in existing digest or note functionality
