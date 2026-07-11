# Repository Guidelines

myNotes is an Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase cookie auth, and shadcn/ui, deployed to Cloudflare Workers. For full architecture and auth flow, see @CLAUDE.md; this file is the agent onboarding cheat sheet.

## Hard Rules

- Keep full SSR: `output: "server"` in @astro.config.mjs. Every API route must export `const prerender = false`.
- Use the `@/*` alias for `./src/*` (@tsconfig.json). Use `@/` for any import crossing a top-level folder under `src/` (e.g. `src/pages/` → `src/lib/`).
- Default to `.astro` for markup-only pages; use React for client state, forms, and event handlers. No Next.js `"use client"` — put hooks in `src/components/hooks/`.
- Merge Tailwind classes with `cn()` from `@/lib/utils`; never concatenate class strings manually.
- API routes use uppercase `GET`/`POST` exports and validate input with zod.
- Supabase migrations live in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql` with RLS enabled on every new table.
- Never commit secrets. Copy @.env.example to `.env` and `.dev.vars` for `SUPABASE_URL` and `SUPABASE_KEY`.

## Project Structure

- `src/pages/` — routes; `src/pages/api/` — API endpoints; `src/middleware.ts` — auth gate and `PROTECTED_ROUTES`.
- `src/lib/supabase.ts` — SSR Supabase client; `src/components/ui/` — shadcn/ui ("new-york"); `src/types.ts` — shared types.
- `context/` — PRD, tech-stack hand-offs, and change artifacts; do not modify files under `context/` unless the user explicitly requests it.

## Build, Test, and Development Commands

Node.js v22.14.0 (@.nvmrc). Scripts live in @package.json — most-used: `npm run dev`, `npm run lint`, `npm run build`.

No test runner is configured. Pre-commit hooks: see `lint-staged` in @package.json.

## Coding Style & Naming Conventions

- Follow @eslint.config.js. Prefix intentionally unused vars, args, and caught errors with `_`.
- Add shadcn components with `npx shadcn@latest add [name]` into `src/components/ui/`.
- Business logic in `src/lib/` or `src/lib/services/`; shared entities and DTOs in `src/types.ts`.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects (`add …`, `create …`, `bootstrap`). Before pushing, run `npm run lint` and `npm run build`. CI on `master` runs lint + build (@.github/workflows/ci.yml) and requires GitHub secrets `SUPABASE_URL` and `SUPABASE_KEY`.
