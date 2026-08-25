# Review Follow-ups: capture-note-with-tag

Queued from the implementation review (2026-08-25). See `../reviews/impl-review.md`.

## F1 — Make tag find-or-create concurrency-safe (hardening)

- **Source**: F1 (WARNING, Safety & Quality) — accepted for MVP via Fix B.
- **Location**: `src/lib/services/notes.ts:93-99` (`findOrCreateTags`), catch at `:139`.
- **Problem**: Read-then-batch-insert has no unique-violation handling. A concurrent same-name insert violates the `tags(user_id, lower(name))` unique index and throws, which the wrapping catch converts to `tagsAttached: false`, dropping ALL tags for the note. Contradicts the plan's Key Discovery (plan.md:25). Unlikely at MVP scale but a double-submit can trigger it.
- **Proposed fix**: On the tag insert, catch the Postgres unique-violation (code `23505`), re-fetch the user's tags, and resolve the conflicting names against the now-existing rows instead of failing the whole batch. Verify the error-code field name in the installed Supabase client version.
- **Note durability**: unaffected — the note is always saved first (Guardrail #2).
