---
change_id: notes-schema-and-rls
title: Notes/tags/note_tags schema with per-operation RLS
status: archived
created: 2026-08-19
updated: 2026-08-20
archived_at: 2026-08-20T21:54:47Z
---

## Notes

Foundation F-01 from [roadmap.md](../../foundation/roadmap.md). Deploy the `notes`, `tags`, and `note_tags` schema in Supabase with per-operation RLS so every authenticated user can only operate on their own rows — no cross-account access.

- **PRD refs:** Access Control (§Granica danych), Guardrail #1 (Izolacja danych użytkowników); precedes FR-004/005/009/010/015.
- **Unlocks:** `S-01 capture-note-with-tag` directly; transitively all other S-NN slices.
- **Prerequisites:** none (Supabase cloud project already connected per baseline; `supabase/migrations/` is currently empty).
- **Scope guard:** deliberately minimal — no `ai_content`, no `ai_run_failures` (those land in S-02 and Parking). The data-isolation guardrail is binary: a single missing RLS policy on `notes` = MVP failure, so sequence this earliest to catch mistakes before S-01 starts writing data.
