---
bootstrapped_at: 2026-07-01T22:57:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: my-notes
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: my-notes
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
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
```

### Why this stack

Solo builder shipping MyNotes in 3 after-hours weeks needs a battle-tested, agent-friendly full-stack starter with OAuth, PostgreSQL, and edge deploy out of the box. 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) is the recommended default for web apps in JavaScript; it clears all four agent-friendly quality gates and matches PRD must-haves: Google OAuth (FR-001–003), AI digests and weekly summaries (FR-015–019), and text search via Postgres (FR-020). Cloudflare Pages is the starter default; GitHub Actions with auto-deploy-on-merge keeps the solo workflow lean. The weekly summary job (FR-018) will need a lightweight cron trigger against an API route — the starter's edge runtime handles MVP scope without a heavy queue.

## Pre-scaffold verification

| Signal        | Value                                                    | Severity | Notes                                      |
| ------------- | -------------------------------------------------------- | -------- | ------------------------------------------ |
| npm package   | not run                                                  | —        | cmd_template uses git clone, not npm create |
| GitHub repo   | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card.docs_url                         |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 6 HIGH, 10 MODERATE, 2 LOW
**Direct vs transitive**: 0/1/3/0 direct of total 0/6/10/2

#### CRITICAL findings

None.

#### HIGH findings

- **astro** (direct) — v6.x, 3 advisories:
  - GHSA-8hv8-536x-4wqp: Reflected XSS via unescaped slot name (CVSS 7.1). Fix: upgrade to >=6.3.3
  - GHSA-jrpj-wcv7-9fh9: XSS via Unescaped Attribute Names in Spread Props (CVSS 4.2, classified moderate but rolled into astro's high aggregate). Fix: upgrade to >=6.4.6
  - GHSA-2pvr-wf23-7pc7: Host header SSRF in prerendered error page fetch (CVSS 7.5). Fix: upgrade to >=6.4.6
- **devalue** (transitive) — v5.6.3–5.8.0. GHSA-77vg-94rm-hx3p: DoS via sparse array deserialization (CVSS 7.5). Fix available.
- **undici** (transitive) — v7.0.0–7.27.2, 4 high-severity advisories:
  - GHSA-vmh5-mc38-953g: TLS certificate validation bypass via SOCKS5 ProxyAgent (CVSS 7.4)
  - GHSA-vxpw-j846-p89q: WebSocket DoS via fragment count bypass (CVSS 7.5)
  - GHSA-hm92-r4w5-c3mj: Cross-origin request routing via SOCKS5 proxy pool reuse (CVSS 7.5)
  - Fix: upgrade to >=7.28.0
- **vite** (transitive) — v7.0.0–7.3.3. GHSA-fx2h-pf6j-xcff: server.fs.deny bypass on Windows alternate paths. Fix: upgrade to >=7.3.4
- **ws** (transitive) — v8.0.0–8.20.1. GHSA-96hv-2xvq-fx4p: Memory exhaustion DoS from tiny fragments (CVSS 7.5). Fix: upgrade to >=8.21.0
- **miniflare** (transitive) — via undici + ws. Fix available by upgrading dependencies.

#### MODERATE findings

- **@astrojs/check** (direct) — via @astrojs/language-server → volar-service-yaml chain. Fix: downgrade to 0.9.2 (semver-major).
- **supabase** (direct) — v1.1.6–2.98.2, via tar. GHSA-vmf3-w455-68vh: tar file smuggling (CVSS 0). Fix available.
- **wrangler** (direct) — v3.108.0–4.101.0, via esbuild + miniflare. Fix available.
- **@cloudflare/vite-plugin** (transitive) — via miniflare, wrangler, ws. Fix available.
- **@astrojs/language-server** (transitive) — via volar-service-yaml. Fix available.
- **volar-service-yaml** (transitive) — via yaml-language-server. Fix available.
- **yaml-language-server** (transitive) — via yaml. Fix available.
- **yaml** (transitive) — v2.0.0–2.8.2. GHSA-48c2-rrv3-qjmp: Stack Overflow via deeply nested YAML (CVSS 4.3). Fix: upgrade to >=2.8.3.
- **tar** (transitive) — <=7.5.15. GHSA-vmf3-w455-68vh: PAX size override file smuggling. Fix available.
- **js-yaml** (transitive) — v4.0.0–4.1.1. GHSA-h67p-54hq-rp68: Quadratic DoS in merge key handling (CVSS 5.3). Fix available.
- **undici** additional moderate: GHSA-p88m-4jfj-68fv (Set-Cookie percent-decoding, CVSS 5.9), GHSA-pr7r-676h-xcf6 (shared cache whitespace bypass, CVSS 5.9).

#### LOW / INFO findings

- **@babel/core** (transitive) — <=7.29.0. GHSA-4x5r-pxfx-6jf8: Arbitrary file read via sourceMappingURL (CVSS 3.2). Fix available.
- **esbuild** (transitive) — v0.27.3–0.28.0. GHSA-g7r4-m6w7-qqqr: Arbitrary file read on Windows dev server (CVSS 2.5). Fix available.
- **undici** additional low: GHSA-35p6-xmwp-9g52 (keep-alive response queue poisoning, CVSS 3.7), GHSA-g8m3-5g58-fq7m (Set-Cookie SameSite downgrade, CVSS 3.7).

## Hints recorded but not acted on

| Hint                    | Value               |
| ----------------------- | ------------------- |
| bootstrapper_confidence | first-class         |
| quality_override        | false               |
| path_taken              | standard            |
| self_check_answers      | null                |
| team_size               | solo                |
| deployment_target       | cloudflare-pages    |
| ci_provider             | github-actions      |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                |
| has_payments            | false               |
| has_realtime            | false               |
| has_ai                  | true                |
| has_background_jobs     | true                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
