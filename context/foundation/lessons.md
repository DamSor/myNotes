# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## API routes must return a JSON error envelope on every path, including 500s

- **Context**: src/pages/api/notes.ts, src/pages/api/tags.ts — data-API routes calling service functions that `throw` on Supabase errors.
- **Problem**: Service calls made without a surrounding try/catch let exceptions escape as Astro's default HTML 500 page, instead of the JSON `{ error }` shape the route returns on every other branch. This breaks the data-API contract that downstream slices inherit.
- **Rule**: Every API handler wraps its service/DB calls in try/catch and returns a JSON error body (`json({ error }, 500)`) on failure — never let an exception produce a non-JSON response.
- **Applies to**: src/pages/api/**/*.ts

## Don't swallow errors silently in a partial-success catch — log before degrading

- **Context**: src/lib/services/notes.ts:139 — the catch that converts a tag/link failure into `tagsAttached: false`.
- **Problem**: The `catch {}` preserves the note (correct) but discards the error, so a silent degradation (e.g. a unique-violation race) leaves no server-side trace to diagnose why tags failed to attach.
- **Rule**: When a catch intentionally degrades to a partial-success result, always log the underlying error (`console.error`) before returning — never swallow it.
- **Applies to**: src/lib/services/**/*.ts

## Validate dynamic route params before forwarding to the service layer

- **Context**: src/pages/api/notes/[id].ts — dynamic API route accepting a path param as an entity identifier.
- **Problem**: URL path params (e.g. `:id`) forwarded unsanitized to the service cause PostgREST to throw on invalid input syntax (22P02), surfacing as a generic 500 instead of a clean 404/400 — breaking the expectation that invalid/missing/non-owned IDs all return 404.
- **Rule**: Validate path params (z.string().uuid() or similar) at the route level before calling service functions; return 404 on invalid format.
- **Applies to**: src/pages/api/**/*.ts (any dynamic [param] route)

## Hoist shared API helpers in the convention-setting slice, don't copy-paste

- **Context**: src/pages/api/notes.ts:8-13, src/pages/api/tags.ts:7-12 — an identical `json(body, status)` Response helper copy-pasted into both new routes.
- **Problem**: The first slice of a new API surface sets the pattern downstream slices copy. Duplicating a helper inline invites drift (each future route re-copies and slowly diverges) instead of sharing one implementation.
- **Rule**: Extract shared API/route helpers (JSON responses, error envelopes) into `src/lib/` and import them; never copy-paste route boilerplate across endpoints.
- **Applies to**: src/pages/api/**/*.ts, src/lib/
