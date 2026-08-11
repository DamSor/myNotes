---
starter_id: 10x-astro-starter
package_manager: npm
project_name: my-notes
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: true
---

## Why this stack

Solo builder shipping MyNotes in 3 after-hours weeks needs a battle-tested, agent-friendly full-stack starter with OAuth, PostgreSQL, and edge deploy out of the box. 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) is the recommended default for web apps in JavaScript; it clears all four agent-friendly quality gates and matches PRD must-haves: Google OAuth (FR-001–003), AI digests and weekly summaries (FR-015–019), and text search via Postgres (FR-020). Cloudflare Workers is the deployment target (Astro 6 / `@astrojs/cloudflare` v13 dropped Pages support in favor of Workers-only); GitHub Actions with auto-deploy-on-merge keeps the solo workflow lean. The weekly summary job (FR-018) will need a lightweight Cron Trigger against an API route — the Workers runtime handles MVP scope without a heavy queue. Full platform rationale, cross-check, and risk register: see `context/foundation/infrastructure.md`.
