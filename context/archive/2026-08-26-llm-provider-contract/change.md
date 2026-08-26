---
change_id: llm-provider-contract
title: Kontrakt integracji z LLM providerem (OpenRouter + training opt-out)
status: archived
created: 2026-08-26
updated: 2026-08-26
archived_at: 2026-08-26T20:27:32Z
---

## Notes

Wyprowadzone z `context/foundation/roadmap.md` → **F-02: Kontrakt integracji z LLM providerem**.

- **Outcome:** integracja z OpenRouter wdrożona — `OPENROUTER_API_KEY` w produkcji (`wrangler secret put`) i w `.dev.vars`, thin wrapper `src/lib/services/llm.ts`, decyzja o training-opt-out zapisana w AGENTS.md.
- **PRD refs:** Guardrail #3 (podłoga jakości AI — brak halucynacji), Open Question #3 (LLM data hygiene / training opt-out, Block: tak); poprzedza FR-015 / FR-018.
- **Unlocks:** `S-02 first-ai-digest-on-click` (north star), `S-08 weekly-summary-cron`; definitywnie rozwiązuje OQ#3.
- **Blocker (Owner: user):** wybór planu/dostawcy OpenRouter z **kontraktowym** training-opt-outem (nie tylko w politykach). Roadmap trzyma F-02 jako `blocked` do rozstrzygnięcia — bez tego guardrail izolacji danych ma niepełną definicję poza granicą aplikacji.
