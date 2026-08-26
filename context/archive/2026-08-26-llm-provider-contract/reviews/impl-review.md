<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: LLM Provider Contract (OpenRouter Integration)

- **Plan**: context/changes/llm-provider-contract/plan.md
- **Scope**: Phase 1–2 of 2 (full plan)
- **Date**: 2026-08-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — No fetch timeout / AbortSignal on OpenRouter call

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/llm.ts:100
- **Detail**: The `fetch()` call to OpenRouter has no `AbortSignal` / timeout. While workerd enforces its own wall-clock limit, without an explicit timeout the function cannot distinguish "OpenRouter is slow" from "request failed" — the worker would simply be killed by the runtime with no meaningful error logged. This means callers (S-02, S-08) have no opportunity to log a timeout-specific error, retry with a shorter prompt, or degrade gracefully before the isolate is terminated.
- **Fix A ⭐ Recommended**: Add an AbortSignal with a reasonable timeout (e.g. 25s for a 30s worker limit) so the catch block fires before the runtime kills the isolate. Example: `const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25_000); try { res = await fetch(url, { ...opts, signal: controller.signal }); } finally { clearTimeout(timeout); }`.
  - Strength: Gives the wrapper control over timeout behavior; surfaces a typed `LlmRequestError` with "timeout" semantics instead of a silent kill.
  - Tradeoff: Adds ~5 lines of code; timeout value (25s) is a guess — may need tuning once real latency data exists from S-02.
  - Confidence: HIGH — AbortSignal is supported in workerd and is the standard pattern.
  - Blind spot: The optimal timeout value depends on real-world latency observed in S-02/S-08; 25s is a conservative starting point.
- **Fix B**: Defer to S-02 — let the calling slice own the timeout at a higher level, where it knows the UX context (e.g. user-facing click vs. background cron).
  - Strength: Keeps the wrapper maximally thin; avoids baking in a timeout that may not fit all callers.
  - Tradeoff: Every caller must independently remember to add a timeout, risking omission.
  - Confidence: MEDIUM — viable but pushes the responsibility upstream.
  - Blind spot: S-08 (cron) has its own time constraints; duplicating timeout logic per-caller is error-prone.
- **Decision**: FIXED via Fix A — added AbortSignal with 25s timeout

### F2 — Hardcoded HTTP-Referer URL

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/llm.ts:5
- **Detail**: `OPENROUTER_HTTP_REFERER` is hardcoded to `"https://my-notes.damian-sordyl.workers.dev"`. If the project is deployed under a different custom domain or the workers.dev subdomain changes, the referer will be stale. OpenRouter uses this for analytics/abuse-detection, not auth, so it won't break — but it may cause confusing attribution in the OpenRouter dashboard.
- **Fix**: Derive from an env var or the Astro `site` config in a future slice. Not blocking for MVP — the workers.dev subdomain is the only deployed domain today.
- **Decision**: SKIPPED

### F3 — No validation of empty messages array

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/llm.ts:75
- **Detail**: `chatCompletion` does not validate that `messages` is non-empty before sending to OpenRouter. An empty array would produce a 400 from the provider, which gets caught and surfaced as an `LlmRequestError` — functional but opaque to the caller ("OpenRouter request failed (400): ..." instead of "messages must not be empty").
- **Fix**: Add a fast guard `if (messages.length === 0) throw new LlmRequestError("messages must not be empty")` for clearer diagnostics. Low priority — callers (S-02/S-08) will always supply system+user messages.
- **Decision**: FIXED
