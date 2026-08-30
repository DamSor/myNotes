<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit or Delete Digest

- **Plan**: context/changes/edit-or-delete-digest/plan.md
- **Scope**: Full plan — Phases 1–3 of 3
- **Date**: 2026-08-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS ✅ |
| Scope Discipline | PASS ✅ |
| Safety & Quality | WARNING ⚠️ (1 finding) |
| Architecture | PASS ✅ |
| Pattern Consistency | WARNING ⚠️ (1 finding) |
| Success Criteria | PASS ✅ |

## Findings

### F1 — Duplicate date formatting helpers across components

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ai/DigestItem.tsx:25, src/components/notes/NoteItem.tsx:30
- **Detail**: `DigestItem.formatDate` uses `toLocaleDateString(undefined, { year, month, day, hour, minute })` while `NoteItem.formatDate` uses `toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })`. Both serve the same purpose (human-readable timestamp on a card) but use different Intl APIs. This violates lesson #4 ("Extract shared API/route helpers into `src/lib/`; never copy-paste"). The two approaches may also diverge across locales.
- **Fix**: Extract a shared `formatDate` helper into `src/lib/utils.ts` (or `src/lib/format.ts`) and import from both `DigestItem` and `NoteItem`.
- **Decision**: FIXED — extracted `formatDate` to `src/lib/utils.ts`, updated both `DigestItem` and `NoteItem` to import from shared module

### F2 — LLM-sourced body rendered under prose classes without XSS guard comment

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ai/DigestItem.tsx:204
- **Detail**: The digest body (LLM-generated markdown) is rendered as plain text inside a `<div>` with `prose-invert prose-sm` — Tailwind Typography classes conventionally paired with rendered HTML/markdown. React JSX escaping neutralizes XSS today, but `prose-*` classes signal "rendered rich text" to future developers. If someone later swaps `{digest.body}` for a markdown renderer (`dangerouslySetInnerHTML`, `react-markdown` with `rehype-raw`), the LLM-sourced body becomes an injection vector.
- **Fix**: Add a brief guard comment above the render site — e.g. `{/* Body is LLM-sourced — render as text only. Do NOT use dangerouslySetInnerHTML or an unsanitized markdown renderer. */}` — zero runtime cost, prevents future escalation.
- **Decision**: FIXED — guard comment added above render site in DigestItem.tsx

### F3 — softDeleteAiContent uses JS clock instead of DB now()

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/digest.ts:275
- **Detail**: Plan specified `SET deleted_at = now()` (DB-side timestamp). Implementation uses `new Date().toISOString()` (JS-side). This is a pragmatic adaptation — the Supabase JS `.update()` method doesn't accept raw SQL expressions; a true `now()` would require an RPC or raw query. On Cloudflare workerd the request-scoped clock is frozen per-request, so the timestamp is consistent. Functional difference is negligible (sub-second client-vs-DB offset).
- **Fix**: No action needed for MVP. If strict DB-clock consistency is later required, migrate to `.rpc()` or raw SQL.
- **Decision**: SKIPPED

### F4 — "This can't be undone" dialog copy on soft-delete

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ai/DigestItem.tsx:144
- **Detail**: The AlertDialog description says "This can't be undone," but the underlying operation is a soft-delete (`deleted_at` is set; the row is preserved). The data is safe. However, if you add an "undo" or "restore" feature later, the copy will be factually incorrect. The S-03 NoteItem delete dialog uses the same wording for a hard delete, where it's accurate.
- **Fix**: Consider softening to "This will remove the digest from your list." or leave as-is (matches S-03 convention for user-facing finality).
- **Decision**: FIXED — softened dialog copy to "This will remove the digest from your list."
