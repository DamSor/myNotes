---
project: MyNotes
version: 1
status: draft
created: 2026-08-18
updated: 2026-08-26
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: MyNotes

> Wyprowadzone z `context/foundation/prd.md` (v1) + auto-zbadany baseline codebase'u (2026-08-18).
> Edit-in-place; archiwizuj gdy zastąpione.
> Slice'y poniżej są ułożone w porządku zależności. Tabela "At a glance" jest indeksem.

## Vision recap

MyNotes rozwiązuje problem "myśli, do których nikt nie wraca" — aktywnie myślący indywidualiści łapią pomysły w ciągu dnia, ale hierarchiczne narzędzia (Notion, Obsidian) każą im najpierw zdecydować gdzie i jak, zanim zapiszą. Wgląd produktu: wąskim gardłem nie jest edytor, tylko **powrót do zapisanego** — dlatego MyNotes celowo trzyma edytor prosty i inwestuje w AI-agregacje (digesty per-tag na klik + cotygodniowe podsumowania grounded w treści użytkownika), tak żeby produkt sam wracał do użytkownika z sensem. W tej roadmapie termin **grounded** oznacza: tekst AI opiera się wyłącznie na notatkach użytkownika z wybranego zakresu, brak halucynacji, brak faktów spoza źródeł — jeśli źródła są puste, AI mówi "brak materiału", nie zmyśla (guardrail jakości AI z PRD).

## North star

**S-02 `first-ai-digest-on-click`: user tworzy notatkę z tagiem, klika "Generuj digest" i dostaje pierwszy digest AI w sekcji "AI dla mnie"** — pierwsza połowa Primary Success Criterion PRD zszyta w jeden slice: FR-004 → FR-009/010 → FR-015 → FR-016 dostarczone end-to-end w jednej sesji użytkownika.

> **Gwiazda przewodnia** (north star) w tym dokumencie oznacza: najmniejszy end-to-end slice, którego dostarczenie udowadnia rdzenną hipotezę produktu — placeholder tak wczesny, jak Prerequisites pozwolą, bo wszystko inne ma sens tylko wtedy, gdy to zadziała. Termin pojawia się dalej w Risk-liniach; definicja obowiązuje w całym dokumencie.

## At a glance

| ID   | Change ID                     | Outcome (user can / foundation)                                                                       | Prerequisites          | PRD refs                    | Status   |
| ---- | ----------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------- | -------- |
| F-01 | `notes-schema-and-rls`        | (foundation) schemat `notes` + `tags` + `note_tags` z RLS per-operacja wdrożony                       | —                      | Access Control, Guardrail#1 | done     |
| F-02 | `llm-provider-contract`       | (foundation) integracja z OpenRouter + decyzja o training-opt-out zablokowana                         | —                      | Guardrail#3, OQ#3           | in-progress |
| S-01 | `capture-note-with-tag`       | user tworzy notatkę plain-text z tagami (typeahead) i widzi ją w płaskiej liście                      | F-01                   | FR-004, FR-005, FR-009, FR-010 | done |
| S-02 | `first-ai-digest-on-click`    | user klika "Generuj digest" dla wybranego tagu i widzi digest AI w sekcji "AI dla mnie" (NORTH STAR)  | S-01, F-02             | FR-015, FR-016              | proposed |
| S-03 | `inline-edit-and-delete-note` | user edytuje notatkę inline w liście i usuwa ją po potwierdzeniu w dialogu                            | S-01                   | FR-006, FR-007, FR-008      | done |
| S-04 | `single-tag-filter`           | user filtruje listę notatek po pojedynczej etykiecie                                                  | S-01                   | FR-011                      | proposed |
| S-05 | `text-search`                 | user wyszukuje notatki po fragmencie tekstu (case-insensitive, substring)                             | S-01                   | FR-020                      | proposed |
| S-06 | `edit-or-delete-digest`       | user edytuje digest inline lub usuwa go w sekcji "AI dla mnie" (sygnały 70% akceptacji)               | S-02                   | FR-017                      | proposed |
| S-07 | `google-oauth-swap`           | user loguje się przez Google OAuth zamiast przez email+hasło i jawnie się wylogowuje                  | —                      | FR-001, FR-002, FR-003, Access Control | ready    |
| S-08 | `weekly-summary-cron`         | user dostaje w niedzielny poranek cotygodniową notatkę AI, gdy w ostatnim tygodniu ma ≥3 notatki      | F-01, F-02, S-01       | US-01, FR-018, FR-019       | proposed |

## Streams

Pomoc nawigacyjna — grupuje itemy dzielące łańcuch Prerequisites. Kanoniczna kolejność żyje w grafie zależności; ta tabela to proponowana kolejność czytania across parallel tracks.

| Stream | Theme                        | Chain                                                       | Note                                                                                                                                     |
| ------ | ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Podstawowa pętla notatki     | `F-01` → `S-01` → `S-03` / `S-04` / `S-05`                  | Wertykalna baza CRUD + tagi + filtr + wyszukiwanie; speed bias trzyma to jako główną autostradę do north-stara.                          |
| B      | AI-agregacja (rdzeń produktu) | `F-02` → `S-02` → `S-06` / `S-08`                           | Rdzeń hipotezy MyNotes. Dołącza do Strumienia A w `S-01` (S-02 i S-08 potrzebują notatek). North star = `S-02`; `S-08` = cotygodniówka. |
| C      | Compliance auth              | `S-07`                                                      | OAuth Google swap (FR-001..003); standalone; nie blokuje north-stara, ale musi wejść przed publicznym MVP.                              |

## Baseline

Co jest już w kodzie na dzień `2026-08-18` (auto-zbadane + potwierdzone przez usera). Foundations poniżej zakładają, że TE elementy istnieją i nie budują ich ponownie.

- **Frontend:** present — Astro 6 SSR + React 19 + Tailwind 4 + shadcn/ui działają; `src/layouts/Layout.astro`, `src/components/Topbar.astro`, `src/components/Welcome.astro`, `src/pages/dashboard.astro` obecne.
- **Backend / API:** present — wzorzec Astro API routes ugruntowany (`src/pages/api/auth/{signin,signup,signout}.ts`); brak jeszcze endpointów dla notatek/tagów/digestów.
- **Data:** partial — Supabase cloud project podłączony, sekrety w produkcji + `.dev.vars` (deployment-plan §Phase 3); `supabase/config.toml` obecny, ALE `supabase/migrations/` jest puste (0 migracji). Brak schematu domenowego.
- **Auth:** partial — Supabase SSR działa E2E na produkcji przez email+hasło (`src/lib/supabase.ts`, `src/middleware.ts` gate'uje `/dashboard`); PRD wymaga OAuth Google (FR-001/002) — provider nie skonfigurowany (deployment-plan §P.3 sub-1..3 pending).
- **Deploy / infra:** present — live na Cloudflare Workers (`my-notes.damian-sordyl.workers.dev`); Workers Builds auto-deploy na push do `main`; GH Actions CI (lint + build) zielony; `wrangler.jsonc` gotowy — bez crona.
- **Observability:** partial — `wrangler.jsonc` ma `observability: enabled: true`, `wrangler tail` streamuje; brak surface'u aplikacyjnego (np. tabeli `ai_run_failures` z risk register infrastructure.md) do widoczności błędów AI-jobów.

## Foundations

### F-01: Schemat notatek i tagów + RLS

- **Outcome:** (foundation) schemat `notes`, `tags`, `note_tags` z RLS per-operacja wdrożony w Supabase — każdy zalogowany użytkownik może operować tylko na własnych wierszach, brak dostępu cross-account.
- **Change ID:** `notes-schema-and-rls`
- **PRD refs:** Access Control (§Granica danych), Guardrail #1 (Izolacja danych użytkowników), poprzedza FR-004/005/009/010/015 (wszystkie must-have z warstwy notatek/tagów/AI potrzebują tych tabel).
- **Unlocks:** `S-01 capture-note-with-tag` (bezpośrednio), pośrednio wszystkie pozostałe S-NN.
- **Prerequisites:** — (Supabase cloud project już podłączony w baseline).
- **Parallel with:** F-02.
- **Blockers:** —.
- **Unknowns:** —.
- **Risk:** Guardrail izolacji danych jest binarny — jeden brakujący RLS policy na `notes` = porażka MVP niezależnie od Primary metric; sekwencjonowane najwcześniej, żeby błąd zauważyć zanim S-01 zacznie zapisywać dane. Zakres celowo minimalny (bez `ai_content`, bez `ai_run_failures`) — progressive disclosure; te tabele wchodzą w S-02 i Parkingu.
- **Status:** done

### F-02: Kontrakt integracji z LLM providerem

- **Outcome:** (foundation) integracja z OpenRouter wdrożona — `OPENROUTER_API_KEY` w produkcji (`wrangler secret put`) i w `.dev.vars`, thin wrapper `src/lib/services/llm.ts`, decyzja o training-opt-out zapisana w AGENTS.md.
- **Change ID:** `llm-provider-contract`
- **PRD refs:** Guardrail #3 (Podłoga jakości AI — brak halucynacji), Open Question #3 (LLM data hygiene / training opt-out, Block: tak), poprzedza FR-015/FR-018.
- **Unlocks:** `S-02 first-ai-digest-on-click` (north star), `S-08 weekly-summary-cron`; rozwiązuje OQ#3 (blocking) definitywnie.
- **Prerequisites:** — (baseline Cloudflare Workers + secrets flow już działa).
- **Parallel with:** F-01.
- **Blockers:** OpenRouter plan/dostawca z jawnym training-opt-outem — decyzja usera (Owner: użytkownik).
- **Unknowns:**
  - Który plan OpenRouter (lub inny model) faktycznie zapewnia training-opt-out kontraktowo, a nie tylko w politykach? — Owner: user. Block: yes.
- **Risk:** Bez tej decyzji guardrail izolacji danych nie ma pełnej definicji poza granicą aplikacji (PRD OQ#3 explicite). Foundation trzymana `blocked` do rozwiązania — próba wystartowania S-02 bez tego = kompromis guardrailu; roadmap ma to zatrzymać przed `/10x-plan`.
- **Status:** in-progress

## Slices

### S-01: Utwórz notatkę z tagami i zobacz ją w liście

- **Outcome:** user może utworzyć notatkę zawierającą wyłącznie plain text, przypisać do niej jedną lub wiele etykiet (z typeahead z własnych istniejących tagów), i zobaczyć ją w płaskiej liście posortowanej od najnowszej z datą utworzenia jako pierwszym wierszem.
- **Change ID:** `capture-note-with-tag`
- **PRD refs:** FR-004, FR-005, FR-009, FR-010; NFR "Latencja zapisu < 500 ms p95".
- **Prerequisites:** F-01.
- **Parallel with:** S-07 (OAuth swap nie dotyka warstwy notatek).
- **Blockers:** —.
- **Unknowns:** —.
- **Risk:** Ten slice ustala shape'y API notatek i tagów (endpoint contracts, response shape, DTO w `src/types.ts`) — jeśli źle nazwane, S-02/S-03/S-04/S-05 dziedziczą kompromis. Trzymać jeden endpoint per zasób, DTO w `src/types.ts`, zod validation w POST/PATCH.
- **Status:** done

### S-02: Pierwszy digest AI na klik (NORTH STAR)

- **Outcome:** user w widoku listy filtrowanej po tagu (S-04 sequenced po tym — tu wystarczy prosty tag-selector) klika "Generuj digest" i po ≤ 2 s widocznego postępu (streaming lub spinner) dostaje nowy wpis typu "digest" w dedykowanej sekcji "AI dla mnie", oznaczony tagiem źródłowym, grounded w notatkach tego tagu od ostatniego digestu (lub od początku, jeśli pierwszy raz).
- **Change ID:** `first-ai-digest-on-click`
- **PRD refs:** FR-015, FR-016; Guardrail #3 (grounded); NFR "Ciągły postęp generowania AI ≤ 2 s bez sygnału".
- **Prerequisites:** S-01, F-02.
- **Parallel with:** S-03, S-04, S-05 (żaden nie zależy od S-02).
- **Blockers:** —.
- **Unknowns:**
  - Czy w MVP jeden model OpenRouter (np. GPT-4o-mini lub Claude Haiku) wystarcza dla wszystkich digestów, czy trzeba fallbacku? — Owner: developer. Block: no (dowolny domyślny wystarczy do walidacji hipotezy).
  - Kształt promptu enforce'ującego "grounded" — jaki minimalny zestaw sekcji ("tematy / decyzje / otwarte wątki / sprzeczności / brak materiału jeśli tak")? — Owner: developer. Block: no.
- **Risk:** Ten slice **dowodzi lub podważa rdzeń produktu**. Jeśli AI produkuje bezużyteczne digesty, wszystkie downstream slice'y (S-03..S-08) tracą sens jako MVP. Zaakceptowane ryzyko `speed`: zaczynamy z pierwszym rozsądnym promptem i modelem, iterujemy tylko jeśli sygnał 70% akceptacji się nie broni. Ten slice tworzy tabelę `ai_content` (kolumny: id, user_id, source_tag_id nullable, kind enum('digest','weekly'), body text, created_at, updated_at) z RLS — progressive disclosure, nie w F-01.
- **Status:** proposed

### S-03: Edytuj notatkę inline i usuń z potwierdzeniem

- **Outcome:** user w liście notatek klika wiersz i edytuje treść notatki oraz przypisanie tagów bezpośrednio inline (bez nawigacji do osobnego widoku); user może definitywnie usunąć notatkę po potwierdzeniu w dialogu.
- **Change ID:** `inline-edit-and-delete-note`
- **PRD refs:** FR-006, FR-007, FR-008; Guardrail #2 (Trwałość notatek).
- **Prerequisites:** S-01.
- **Parallel with:** S-02, S-04, S-05.
- **Blockers:** —.
- **Unknowns:** —.
- **Risk:** Inline-edit + delete-dialog dotykają tego samego wiersza listy — konflikt UX (klik = edit vs. klik = delete) jest realny; wymaga jasnego rozdzielenia hitboxów i keyboard shortcuts. Twardy delete zaakceptowany świadomie (brak kosza) — dialog potwierdzenia jest minimalnym zabezpieczeniem.
- **Status:** done

### S-04: Filtruj notatki po pojedynczym tagu

- **Outcome:** user wybiera pojedynczą etykietę i lista notatek pokazuje tylko notatki oznaczone tym tagiem; wybór drugiego tagu zastępuje pierwszy (single-tag filter, nie multi-select).
- **Change ID:** `single-tag-filter`
- **PRD refs:** FR-011.
- **Prerequisites:** S-01.
- **Parallel with:** S-02, S-03, S-05.
- **Blockers:** —.
- **Unknowns:** —.
- **Risk:** Konsekwentnie z FR-011 — multi-tag filter (AND/OR) świadomie odsunięty do v2. Ryzyko: jeśli user na etapie dogfoodingu naturalnie sięga po wiele tagów jednocześnie, ten slice trafia w mur UX; można wtedy pomyśleć o promocji multi-tag z Parkingu.
- **Status:** proposed

### S-05: Wyszukaj notatki po fragmencie tekstu

- **Outcome:** user wpisuje fragment tekstu w pole wyszukiwarki i lista notatek zawęża się do tych, których treść zawiera ten fragment; dopasowanie case-insensitive i substring (nie word-boundary).
- **Change ID:** `text-search`
- **PRD refs:** FR-020.
- **Prerequisites:** S-01.
- **Parallel with:** S-02, S-03, S-04.
- **Blockers:** —.
- **Unknowns:**
  - Czy MVP-scale (small users, small data) uzasadnia proste `ILIKE '%q%'`, czy dodać indeks pełnotekstowy (Postgres `tsvector`) od razu? — Owner: developer. Block: no (`ILIKE` jest deklarowany jako wystarczający w shape-notes `## Forward: tech-stack`).
- **Risk:** Bez tego slice'u płaska lista rozsypie się po ~pierwszym tygodniu użycia (dokumentowany insight z Socratic FR-005 w PRD). Sekwencyjnie może być parallel z pozostałymi.
- **Status:** proposed

### S-06: Edytuj lub usuń digest w "AI dla mnie"

- **Outcome:** user w sekcji "AI dla mnie" może edytować inline treść dowolnego digestu (implicit accept), lub usunąć go (jawny reject); brak przycisku "akceptuj" — brak akcji też liczy się jako akceptacja; sygnały edit/no-op/delete zasilają metrykę Primary "≥70% akceptacji".
- **Change ID:** `edit-or-delete-digest`
- **PRD refs:** FR-017; Primary Success Criterion (≥70% akceptacji).
- **Prerequisites:** S-02.
- **Parallel with:** S-08.
- **Blockers:** —.
- **Unknowns:**
  - Definicja "edycji" w metryce Primary 70% — czy każda edycja (poprawka literówki vs. rewrite całości) to ten sam sygnał? Czy implicit accept ma okno czasowe (np. 30 dni)? — Owner: user (metric design). Block: no (jakakolwiek rozsądna definicja zadziała w MVP; udokumentować w AGENTS.md przy implementacji).
- **Risk:** Tabela `ai_content` już istnieje z S-02 — ten slice dodaje event-log lub kolumny `status`/`edited_at`/`deleted_at` do policzenia sygnału 70%. Ryzyko: policzenie 70% za mały N (przy 1 userze × ~10 digestów w 3 tyg) — metryka będzie szumowa; zaakceptowane pod speed.
- **Status:** proposed

### S-07: Zaloguj przez Google OAuth (swap z email+hasła)

- **Outcome:** user loguje się do MyNotes klikiem "Zaloguj przez Google" (ten sam flow dla rejestracji i logowania); user może jawnie się wylogować, unieważniając sesję; niezalogowany user nie widzi żadnej funkcji notatek (redirect na ekran logowania).
- **Change ID:** `google-oauth-swap`
- **PRD refs:** FR-001, FR-002, FR-003; Access Control (§Sposób dostępu — federacyjne uwierzytelnienie).
- **Prerequisites:** — (baseline Supabase SSR + middleware auth gate działa; ten slice wymienia provider, nie buduje warstwy).
- **Parallel with:** F-01, F-02, S-01, S-02, S-03, S-04, S-05, S-06 (żaden nie zależy od providera).
- **Blockers:** Google Cloud project + OAuth client credentials (Owner: user; setup manualny w konsoli Google Cloud + Supabase Auth panel — deployment-plan §P.3 sub-bullets 1..3).
- **Unknowns:**
  - TTL sesji + strategia odświeżania tokenu OAuth — nie zdefiniowane w PRD (OQ#1); dowolna rozsądna domyślna polityka Supabase wystarczy. Owner: developer. Block: no.
- **Risk:** Baseline auth (email+hasło) już wozi ruch produkcyjny — swap jest destrukcyjny (invalidates istniejące sesje). Sekwencjonowane po north-starze celowo: w tygodniu 1-2 developer używa emaila do dogfoodingu, w tygodniu 3 swap + testy przed launchem. Nie blokuje walidacji hipotezy — dlatego `Status: ready` mimo bycia w połowie kolejki.
- **Status:** ready

### S-08: Cotygodniowe podsumowanie AI (US-01)

- **Outcome:** raz w tygodniu (poniedziałek 03:00 UTC), jeśli user w minionych 7 dniach utworzył ≥3 notatki, system automatycznie generuje nowy wpis typu "tygodniówka" w sekcji "AI dla mnie" zawierający grounded wgląd AI w treści tygodnia; poniżej progu wpis się NIE tworzy; user może wpis edytować inline (accept) lub usunąć (reject) na tych samych sygnałach co digest.
- **Change ID:** `weekly-summary-cron`
- **PRD refs:** US-01, FR-018, FR-019; Primary Success Criterion (druga połowa pętli MVP).
- **Prerequisites:** F-01, F-02, S-01.
- **Parallel with:** S-06 (edytowanie digestów per-tag).
- **Blockers:** —.
- **Unknowns:**
  - Kształt architekturalny scheduled handler'a — adapter `workerEntryPoint` z custom Worker entry, czy drugi tiny Worker wołający protected API route sekretem współdzielonym? Infrastructure.md §Getting Started #6 poleca drugi Worker dla MVP. Owner: developer. Block: no.
  - Free-tier CPU cap 10 ms na Worker — czy `JSON.parse` odpowiedzi OpenRouter + iteracja po userach mieści się w budżecie? Pre-mortem infrastructure.md §Pre-Mortem sygnalizuje ryzyko. Owner: developer. Block: no (mitigation: `try/catch` z pisaniem błędu do Supabase; upgrade do Workers Paid $5/mo jako tripwire — udokumentowane w `wrangler.jsonc` już dziś).
- **Risk:** Ten slice ma najgęściejszy zestaw ryzyk: cron infra, CPU cap, prompt jakości, próg ≥3 notatek, tydzień oczekiwania na pierwszy sygnał. Sekwencjonowane na koniec pod speed — jest must-have, ale nie blokuje pierwszej połowy Primary SC (S-02 to udowadnia). Bez ai_run_failures surface'u (świadomie sparkowany) — cichy fail w środę już zniknie z Free-tier logów (retencja 3 dni); mitygacja: `try/catch` piszący do `ai_content` z `kind='weekly-failed'` LUB dodać `ai_run_failures` w tym slice'ie jeśli speed pozwoli.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                     | Suggested issue title                                                              | Ready for `/10x-plan` | Notes                                       |
| ---------- | ----------------------------- | ---------------------------------------------------------------------------------- | --------------------- | ------------------------------------------- |
| F-01       | `notes-schema-and-rls`        | Data foundation: schemat notes/tags/note_tags z RLS per-operacja                   | yes                   | Uruchom `/10x-plan notes-schema-and-rls`.   |
| F-02       | `llm-provider-contract`       | LLM foundation: kontrakt OpenRouter + decyzja training-opt-out                     | no                    | Blocked — OQ#3 (Owner: user).               |
| S-01       | `capture-note-with-tag`       | Slice: utwórz notatkę z tagami i zobacz ją w liście                                | no                    | Waits: F-01 done.                           |
| S-02       | `first-ai-digest-on-click`    | Slice (NORTH STAR): pierwszy digest AI na klik w "AI dla mnie"                     | no                    | Waits: S-01 done + F-02 done.               |
| S-03       | `inline-edit-and-delete-note` | Slice: inline-edit + delete-with-confirm notatki                                   | no                    | Waits: S-01 done.                           |
| S-04       | `single-tag-filter`           | Slice: single-tag filter listy notatek                                             | no                    | Waits: S-01 done.                           |
| S-05       | `text-search`                 | Slice: wyszukiwanie po fragmencie tekstu (case-insensitive substring)              | no                    | Waits: S-01 done.                           |
| S-06       | `edit-or-delete-digest`       | Slice: edit/delete digest w "AI dla mnie" (sygnały 70%)                            | no                    | Waits: S-02 done.                           |
| S-07       | `google-oauth-swap`           | Slice: swap email+hasło → Google OAuth (FR-001..003)                               | yes                   | Standalone; można uruchomić kiedykolwiek.   |
| S-08       | `weekly-summary-cron`         | Slice: cotygodniówka AI z cron + próg ≥3 notatek (US-01, FR-018/019)               | no                    | Waits: F-01 + F-02 + S-01 done.             |

## Open Roadmap Questions

1. **Higiena danych po stronie LLM (training opt-out)** — Owner: user. Block: `F-02`, transitive `S-02`, `S-08`. PRD OQ#3, marked Block: yes; guardrail izolacji danych ma niepełną definicję poza granicą aplikacji dopóki nie rozstrzygnięte.
2. **Mobile-friendly responsive w MVP** — Owner: user. Block: `roadmap-wide` (nie blokuje żadnego pojedynczego slice'u, ale przeważa design decisions w S-01/S-03/S-04/S-05). PRD OQ#2; NFR mówi desktop-only, brak jawnego wykluczenia mobile w idea-notes — jeśli responsive wchodzi, każdy UI slice dziedziczy dodatkowe testy breakpointów.

## Parked

- **Bogaty edytor** (WYSIWYG, markdown, tabele, obrazy, style) — PRD §Non-Goals; kandydat na v2 jeśli capture-flow okaże się sztywny.
- **Wgrywanie plików zewnętrznych** (PDF, DOCX, CSV, obrazy) — PRD §Non-Goals; eliminuje pipeline parsowania/OCR-u.
- **Udostępnianie, współedycja, publiczne linki** — PRD §Non-Goals; pozwala metryce 70% odnosić się do indywidualnego kontekstu.
- **Wielopoziomowe foldery / hierarchia** — PRD §Non-Goals; tagi są jedynym wymiarem klasyfikacji.
- **Powiadomienia systemowe w przeglądarce** — PRD §Non-Goals; wraca w v2 razem z mobile.
- **Automatyczne generowanie digestów per-tag (scheduler)** — PRD §Non-Goals; digest wyłącznie na klik user'a (FR-015).
- **Natywna aplikacja mobilna** — PRD §Non-Goals; wyłącznie web MVP.
- **Kosz / soft-delete notatek** — Non-Goals implicit (FR-008 explicite: twardy delete); kandydat na v2.
- **Multi-tag filter (AND/OR)** — FR-011 explicite ograniczony do single-tag; kandydat na v2 lub po feedback'u.
- **`ai_run_failures` table + UI surface w "AI dla mnie"** — mitigation z risk register `context/foundation/infrastructure.md`; sparkowana pod speed. Rationale: FR-018 nie wymaga UI dla failed runs; obserwabilność przez `wrangler tail` + observability MCP wystarcza w tygodniach 1-3. Promote jeśli tygodniówka cichoo fail'uje w produkcji więcej niż raz.
- **Preview deploys via Workers Builds na fork PR-y** — infrastructure.md flagged jako known limitation (secret access); zaakceptowane, dokumentowane w AGENTS.md.
- **Multi-provider LLM (fallback GPT ↔ Claude)** — Unknown w S-02 zaakceptowany na "jeden model wystarczy dla MVP"; kandydat gdy jakość promptu wymaga porównywania modeli.
- **Mobile-app w v2 vs nigdy** — PRD OQ#4; post-MVP roadmap decision, nie wpływa na MVP.

## Done

(Pusta na pierwszej generacji. `/10x-archive` dopisuje wpisy tutaj — i flipuje Status do `done` — gdy change o pasującym `Change ID` jest archiwizowany.)

- **F-01: (foundation) schemat `notes`, `tags`, `note_tags` z RLS per-operacja wdrożony w Supabase — każdy zalogowany użytkownik może operować tylko na własnych wierszach, brak dostępu cross-account.** — Archived 2026-08-19 → `context/archive/2026-08-19-notes-schema-and-rls/`. Lesson: —.
- **S-01: user może utworzyć notatkę zawierającą wyłącznie plain text, przypisać do niej jedną lub wiele etykiet (z typeahead z własnych istniejących tagów), i zobaczyć ją w płaskiej liście posortowanej od najnowszej z datą utworzenia jako pierwszym wierszem.** — Archived 2026-08-25 → `context/archive/2026-08-25-capture-note-with-tag/`. Lesson: —.
- **S-03: user w liście notatek klika wiersz i edytuje treść notatki oraz przypisanie tagów bezpośrednio inline (bez nawigacji do osobnego widoku); user może definitywnie usunąć notatkę po potwierdzeniu w dialogu.** — Archived 2026-08-26 → `context/archive/2026-08-26-inline-edit-and-delete-note/`. Lesson: —.
