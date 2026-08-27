# Review Follow-ups: First AI Digest on Click

Queued from `reviews/impl-review.md` triage.

## F1 — Windowing watermark can drop notes written during generation

- **Accepted as MVP limitation** (2026-08-27). Code comment added at `src/lib/services/digest.ts` `generateDigest`.
- **Future fix**: add a `covered_until timestamptz` column to `ai_content`, set it to `max(kept.created_at)` at insert, and window on `notes.created_at > last_digest.covered_until` instead of the digest row's own `created_at`. Closes the fetch→LLM→insert loss window.
