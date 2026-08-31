# Google OAuth Swap — Plan Brief

> Full plan: `context/changes/google-oauth-swap/plan.md`

## What & Why

Replace email+password authentication with Google OAuth as the sole login method, per PRD FR-001..003. OAuth eliminates the password management overhead (hashing, reset flow, email confirmation) and matches the single-user MVP persona — one click to sign in, no ceremony.

## Starting Point

Auth is fully operational via email+password with Supabase SSR cookie sessions. The middleware resolves the user on every request and gates protected routes. Auth pages are Astro shells with React islands (SignInForm, SignUpForm) posting to API routes. No OAuth code exists — no callback route, no Google provider configuration, no `signInWithOAuth` calls.

## Desired End State

A single `/auth/signin` page shows a "Sign in with Google" button. Clicking it triggers the Supabase Google OAuth PKCE flow — user authenticates with Google and lands on `/notes` with a valid session. Root `/` redirects to `/notes` (authenticated) or `/auth/signin` (unauthenticated). No password-based auth code remains. Sign-out continues unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Email+password fate | Remove entirely | PRD targets OAuth-only; keeping password adds maintenance for zero users. |
| Auth page consolidation | Single `/auth/signin` page | PRD FR-002: registration and login are the same OAuth flow. |
| External setup | Phase 0 prerequisite with checklist | Google Cloud + Supabase config must exist before any code change can be tested. |
| Existing user migration | Supabase auto-links by email | Same email address links the Google identity to the existing Supabase user — no data loss. |
| Error handling | Reuse query-param + inline display | Same pattern as today; no new toast system needed for a single-button page. |
| Dead code policy | Delete all unused auth files | 10 files become dead code; keeping them invites confusion and import errors. |
| Root page behavior | Auth-aware redirect | No landing page needed — authenticated → `/notes`, unauthenticated → `/auth/signin`. |

## Scope

**In scope:**
- Google Cloud OAuth client + Supabase provider setup (manual)
- New `/auth/callback` server route (PKCE code exchange)
- Rewritten `/api/auth/signin` (OAuth redirect instead of password)
- Simplified `/auth/signin` page (pure Astro, no React)
- Root `/` redirect logic
- Topbar update (remove Sign up link)
- Deletion of 10 dead auth files

**Out of scope:**
- Additional OAuth providers (GitHub, Apple)
- Toast/notification system
- Middleware or RLS changes
- Database schema changes
- Programmatic email→Google account migration

## Architecture / Approach

The OAuth PKCE flow is server-initiated: the signin API route calls `signInWithOAuth` and redirects the user to Google via Supabase's auth URL. After consent, Supabase redirects back to the app's `/auth/callback` route, which calls `exchangeCodeForSession` to set auth cookies. The existing Supabase SSR client, cookie bridge, middleware, and `context.locals.user` pattern remain unchanged — only the authentication trigger changes from password to OAuth.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 0. External Setup | Google Cloud OAuth client + Supabase provider configured | Misconfigured redirect URI → `redirect_uri_mismatch` error |
| 1. OAuth Flow Implementation | Working Google sign-in flow, simplified UI, root redirect | OAuth callback URL mismatch between local and production environments |
| 2. Dead Code Cleanup | 10 files deleted, codebase streamlined | Accidentally deleting ServerNotice (used by notes/AI) |

**Prerequisites:** Google Cloud project access, Supabase dashboard access, OAuth client credentials.
**Estimated effort:** ~1 session across 3 phases (Phase 0 is manual, Phase 1 is the core work, Phase 2 is straightforward deletion).

## Open Risks & Assumptions

- Supabase auto-links identities by email — assumes the Google account uses the same email as the existing password account.
- Existing email+password sessions will be invalidated after the swap — acceptable for a single-user MVP.
- OAuth session TTL defaults to Supabase's built-in policy (PRD OQ#1 deferred).

## Success Criteria (Summary)

- User can sign in with one click via Google and land on `/notes` with a valid session.
- All password-based auth code is removed; `npm run lint` and `npm run build` pass cleanly.
- Sign-out, protected route gating, and `context.locals.user` work identically to before the swap.
