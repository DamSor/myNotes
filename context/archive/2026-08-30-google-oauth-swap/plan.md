# Google OAuth Swap Implementation Plan

## Overview

Replace the current email+password authentication with Google OAuth (PKCE flow via Supabase), consolidate the separate signin/signup pages into a single "Sign in with Google" page, wire a server-side callback route, and remove all dead password-based auth code. The existing middleware, Supabase SSR cookie pattern, and `context.locals.user` carry over unchanged.

## Current State Analysis

Auth is fully operational via email+password — Supabase SSR with cookie-based sessions (`@supabase/ssr` ^0.10.3, `@supabase/supabase-js` ^2.99.1). The middleware resolves the user on every request via `getUser()` and gates `/dashboard`, `/notes`, `/ai`. Auth pages are Astro shells with React islands (`SignInForm`, `SignUpForm`) posting to API routes that call `signInWithPassword` / `signUp`.

No OAuth code exists in the application. No callback route, no `signInWithOAuth` call, no Google provider configuration. The PRD (FR-001..003) requires Google OAuth as the sole auth method.

## Desired End State

A single `/auth/signin` page shows a "Sign in with Google" button. Clicking it initiates the Supabase Google OAuth PKCE flow — the user is redirected to Google, authenticates, and is sent back through Supabase's callback to the app's `/auth/callback` route, which exchanges the code for a session and redirects to `/notes`. The root `/` redirects to `/notes` (authenticated) or `/auth/signin` (unauthenticated). No email+password code remains. Sign-out continues to work via POST to `/api/auth/signout`.

### Key Discoveries:

- Supabase SSR `signInWithOAuth` returns `{ data: { url } }` server-side — the server redirects the user to that URL, keeping the existing POST-form pattern.
- `exchangeCodeForSession(code)` in the callback route sets cookies via the same `setAll` bridge in `src/lib/supabase.ts` — no client-side Supabase instance needed.
- `ServerNotice.tsx` is used by `NoteCapture.tsx` and `NoteItem.tsx`. `ServerError.tsx` is used by `NoteCapture.tsx`, `NoteItem.tsx`, and `DigestItem.tsx`. `SubmitButton.tsx` is used by `NoteCapture.tsx`. All three must survive the cleanup. The remaining `src/components/auth/*` components (`SignInForm`, `SignUpForm`, `FormField`, `PasswordToggle`) are password-form-only.
- `Welcome.astro` is only imported by `index.astro` — becomes dead code when root becomes a redirect.
- The Topbar has a "Sign up" link in the unauthenticated state that must be removed.

## What We're NOT Doing

- Adding a second OAuth provider (GitHub, Apple, etc.) — Google only per PRD.
- Changing the middleware or `context.locals.user` pattern — it's provider-agnostic.
- Modifying RLS policies, database schema, or API routes for notes/tags/AI — auth provider is orthogonal.
- Adding a toast/notification system — reusing the existing query-param error pattern.
- Handling email+password to Google account migration programmatically — Supabase auto-links identities when the email matches.

## Implementation Approach

Three phases: (0) manual external setup, (1) implement the OAuth flow in code, (2) delete dead code. Phase 0 is a prerequisite that must be completed before code changes. Phase 1 is the core work: a new callback route, a rewritten signin API route, a simplified signin page, root redirect, and Topbar update. Phase 2 deletes 8 files that are no longer referenced.

## Phase 0: Google Cloud + Supabase Provider Setup (Manual Prerequisite)

### Overview

Configure Google as an OAuth provider in both Google Cloud Console and Supabase dashboard. This is a one-time manual setup that must be done before any code changes can be tested.

### Changes Required:

#### 1. Google Cloud OAuth Client

**Intent**: Create an OAuth 2.0 client credential that Supabase will use to authenticate users via Google.

**Contract**: Web application type. Authorized redirect URI must be `https://<supabase-project-ref>.supabase.co/auth/v1/callback` (Supabase's built-in OAuth callback endpoint). Copy the resulting Client ID and Client Secret.

#### 2. Supabase Google Provider

**Intent**: Enable Google as an auth provider in the Supabase project so `signInWithOAuth({ provider: 'google' })` works.

**Contract**: In Supabase dashboard → Authentication → Providers → Google: enable, paste Client ID and Client Secret from step 1.

#### 3. Supabase Redirect URLs

**Intent**: Ensure Supabase allows redirecting back to the app after OAuth completes, for both local development and production.

**Contract**: In Supabase dashboard → Authentication → URL Configuration:
- Site URL: `https://my-notes.damian-sordyl.workers.dev` (production)
- Redirect URLs must include:
  - `http://localhost:4321/**` (local dev)
  - `https://my-notes.damian-sordyl.workers.dev/**` (production)

### Success Criteria:

#### Automated Verification:

- N/A (manual configuration, no commands to run)

#### Manual Verification:

- Google Cloud Console shows an OAuth 2.0 Client ID with the correct redirect URI
- Supabase dashboard shows Google provider enabled with credentials populated
- Supabase Redirect URLs include both localhost and production wildcards

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 1: OAuth Flow Implementation

### Overview

Wire the complete OAuth PKCE flow: a callback route that exchanges the auth code for a session, a rewritten signin API route that initiates the OAuth redirect, a simplified signin page with a single Google button, root redirect logic, and Topbar update.

### Changes Required:

#### 1. OAuth Callback Route

**File**: `src/pages/auth/callback.ts` (new)

**Intent**: Handle the redirect from Supabase after Google authentication — extract the `code` query param, exchange it for a session (which sets auth cookies), and redirect the user to `/notes`.

**Contract**: Exports `GET: APIRoute`. Reads `code` from `Astro.url.searchParams`. Calls `supabase.auth.exchangeCodeForSession(code)`. Redirects to `/notes` on success, to `/auth/signin?error=...` on failure or missing code. Must export `const prerender = false`.

#### 2. Rewrite Sign-in API Route

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Replace `signInWithPassword` with `signInWithOAuth` so the form POST initiates the Google OAuth redirect instead of password authentication.

**Contract**: `POST` handler. Calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` where `redirectTo` points to `/auth/callback` on the current origin. Redirects the browser to `data.url` (the Google consent screen URL). On error, redirects to `/auth/signin?error=...`. No longer reads `email`/`password` from formData.

#### 3. Simplify Sign-in Page

**File**: `src/pages/auth/signin.astro`

**Intent**: Replace the React `SignInForm` island (email/password fields) with a pure Astro page containing a single "Sign in with Google" form button. Removes the React dependency from the login page entirely.

**Contract**: Pure Astro component (no `client:load`). Keeps the cosmic glass card styling. Renders a `<form method="POST" action="/api/auth/signin">` with a submit button showing a Google icon and "Sign in with Google" text. Reads `?error` query param and displays it inline (no React `ServerError` component). Removes the "Don't have an account? Sign up" link.

#### 4. Root Page Redirect

**File**: `src/pages/index.astro`

**Intent**: Convert the root page from a landing/welcome page to an auth-aware redirect — authenticated users go to `/notes`, unauthenticated users go to `/auth/signin`.

**Contract**: Frontmatter checks `Astro.locals.user`. If present, `return Astro.redirect("/notes")`. Otherwise, `return Astro.redirect("/auth/signin")`. No HTML body rendered.

#### 5. Update Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Remove the "Sign up" link from the unauthenticated state since signup no longer exists as a separate flow.

**Contract**: Unauthenticated block shows only the "Sign in" link (to `/auth/signin`). Authenticated block unchanged (email, Dashboard link, Sign out button).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No TypeScript errors referencing deleted imports

#### Manual Verification:

- Clicking "Sign in with Google" redirects to Google consent screen
- After Google consent, user lands on `/notes` with a valid session
- `Astro.locals.user` is populated with the Google-linked identity
- Navigating to `/` redirects to `/notes` when authenticated
- Navigating to `/` redirects to `/auth/signin` when not authenticated
- Navigating to `/notes` when not authenticated redirects to `/auth/signin`
- Server errors from OAuth (e.g., denied consent) display on the signin page
- Sign-out still works (POST to `/api/auth/signout`, redirects to `/`)
- Existing user with matching email auto-links to Google identity on first OAuth login

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dead Code Cleanup

### Overview

Delete all files that became unreferenced after the OAuth swap — password-only auth form components, the signup page and API route, the email confirmation page, and the Welcome landing component.

### Changes Required:

#### 1. Delete Password Auth Components

**Files to delete**:
- `src/components/auth/SignInForm.tsx`
- `src/components/auth/SignUpForm.tsx`
- `src/components/auth/FormField.tsx`
- `src/components/auth/PasswordToggle.tsx`

**Intent**: Remove React form components that were used exclusively by the email+password sign-in/sign-up flow. None are imported after Phase 1 changes.

**Contract**: Delete all four files. The following components are **kept** — they are used by non-auth files (`NoteCapture.tsx`, `NoteItem.tsx`, `DigestItem.tsx`):
- `src/components/auth/ServerNotice.tsx`
- `src/components/auth/ServerError.tsx`
- `src/components/auth/SubmitButton.tsx`

#### 2. Delete Signup and Confirm-Email Pages

**Files to delete**:
- `src/pages/auth/signup.astro`
- `src/pages/auth/confirm-email.astro`
- `src/pages/api/auth/signup.ts`

**Intent**: Remove the signup page, its API route, and the email confirmation page — all are part of the email+password flow that no longer exists.

**Contract**: Delete all three files. No other files import or link to them after Phase 1 changes.

#### 3. Delete Welcome Component

**File to delete**: `src/components/Welcome.astro`

**Intent**: Remove the landing page component that was only used by `index.astro`, which now redirects instead of rendering content.

**Contract**: Delete the file. No remaining imports after Phase 1 changes.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No references to deleted files: `grep -r "SignInForm\|SignUpForm\|FormField\|PasswordToggle\|Welcome\|signup\|confirm-email" src/ --include="*.ts" --include="*.tsx" --include="*.astro"` returns no hits

#### Manual Verification:

- Full auth flow still works end-to-end (sign in → notes → sign out → redirect)
- No broken links or 404s when navigating the app
- The `src/components/auth/` directory contains only `ServerNotice.tsx`, `ServerError.tsx`, and `SubmitButton.tsx`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No test runner configured — skip.

### Integration Tests:

- No test runner configured — skip.

### Manual Testing Steps:

1. Start dev server (`npm run dev`) with Google provider configured
2. Navigate to `/` — verify redirect to `/auth/signin`
3. Click "Sign in with Google" — verify redirect to Google consent screen
4. Complete Google auth — verify landing on `/notes` with session active
5. Check `user.email` displays correctly in Topbar/Dashboard
6. Navigate to `/` again — verify redirect to `/notes` (authenticated)
7. Click "Sign out" — verify redirect to `/` → `/auth/signin`
8. Navigate to `/notes` directly — verify redirect to `/auth/signin`
9. Deny consent on Google screen — verify error message on signin page
10. Run `npm run build` — verify production build succeeds
11. Deploy and repeat steps 2-9 against production URL

## Performance Considerations

- OAuth adds one extra server redirect (app → Google → Supabase → app) compared to password auth, but this is a one-time login flow, not a hot path.
- The signin page becomes pure Astro (no React island hydration) — faster initial paint than the current React form.
- Callback route does a single `exchangeCodeForSession` call — lightweight server operation.

## Migration Notes

- **Existing user (you)**: Sign in with Google using the same email address. Supabase auto-links the new Google identity to the existing account via email matching. Existing notes, tags, and AI content remain attached to the same `user.id`.
- **Session invalidation**: Existing email+password sessions will become invalid once the provider is swapped. This is expected — just sign in again via Google.
- **Rollback**: If Google OAuth needs to be reverted, re-add `signInWithPassword` code and re-enable email provider in Supabase dashboard. The callback route is additive and can stay.

## References

- PRD FR-001, FR-002, FR-003: `context/foundation/prd.md`
- Roadmap S-07: `context/foundation/roadmap.md`
- Deployment plan OAuth steps: `context/changes/deployment/deployment-plan.md` §P.3
- Supabase SSR client: `src/lib/supabase.ts`
- Middleware auth gate: `src/middleware.ts`
- Current signin API: `src/pages/api/auth/signin.ts`
- Current signout API: `src/pages/api/auth/signout.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 0: Google Cloud + Supabase Provider Setup (Manual Prerequisite)

#### Manual

- [x] 0.1 Google Cloud OAuth client created with correct redirect URI — 9a9e2c5
- [x] 0.2 Supabase Google provider enabled with credentials — 9a9e2c5
- [x] 0.3 Supabase redirect URLs include localhost and production wildcards — 9a9e2c5

### Phase 1: OAuth Flow Implementation

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — f0dc6cc
- [x] 1.2 Build succeeds: `npm run build` — f0dc6cc
- [x] 1.3 No TypeScript errors referencing deleted imports — f0dc6cc

#### Manual

- [x] 1.4 "Sign in with Google" redirects to Google consent screen — f0dc6cc
- [x] 1.5 After consent, user lands on /notes with valid session — f0dc6cc
- [x] 1.6 Astro.locals.user is populated with the Google-linked identity — f0dc6cc
- [x] 1.7 Root / redirects to /notes when authenticated — f0dc6cc
- [x] 1.8 Root / redirects to /auth/signin when not authenticated — f0dc6cc
- [x] 1.9 /notes when not authenticated redirects to /auth/signin — f0dc6cc
- [x] 1.10 Server errors from OAuth display on signin page — f0dc6cc
- [x] 1.11 Sign-out works and redirects properly — f0dc6cc
- [x] 1.12 Existing user auto-links to Google identity — f0dc6cc

### Phase 2: Dead Code Cleanup

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 722d345
- [x] 2.2 Build succeeds: `npm run build` — 722d345
- [x] 2.3 No references to deleted files in src/ — 722d345

#### Manual

- [x] 2.4 Full auth flow works end-to-end after cleanup — 722d345
- [x] 2.5 No broken links or 404s in the app — 722d345
- [x] 2.6 auth/ directory contains only ServerNotice.tsx, ServerError.tsx, and SubmitButton.tsx — 722d345
