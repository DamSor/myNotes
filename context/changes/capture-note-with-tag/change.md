---
change_id: capture-note-with-tag
title: Utwórz notatkę plain-text z tagami (typeahead) i zobacz ją w płaskiej liście
status: implemented
created: 2026-08-25
updated: 2026-08-25
archived_at: null
---

## Notes

Seed: roadmap slice **S-01 `capture-note-with-tag`** (`context/foundation/roadmap.md`), Stream A "Podstawowa pętla notatki".

- **Outcome:** user tworzy notatkę zawierającą wyłącznie plain text, przypisuje jedną lub wiele etykiet (typeahead z własnych istniejących tagów) i widzi ją w płaskiej liście posortowanej od najnowszej, z datą utworzenia jako pierwszym wierszem.
- **PRD refs:** FR-004, FR-005, FR-009, FR-010; NFR "Latencja zapisu < 500 ms p95".
- **Prerequisites:** F-01 `notes-schema-and-rls` (done — schemat `notes`/`tags`/`note_tags` + RLS wdrożony).
- **Parallel with:** S-07 (OAuth swap nie dotyka warstwy notatek).
- **Risk:** Ten slice ustala shape'y API notatek i tagów (endpoint contracts, response shape, DTO w `src/types.ts`) — jeśli źle nazwane, S-02/S-03/S-04/S-05 dziedziczą kompromis. Trzymać jeden endpoint per zasób, DTO w `src/types.ts`, zod validation w POST/PATCH.
