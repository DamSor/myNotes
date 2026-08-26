---
change_id: inline-edit-and-delete-note
title: Edytuj notatkę inline (treść + tagi) i usuń ją po potwierdzeniu w dialogu
status: implemented
created: 2026-08-26
updated: 2026-08-26
---

## Notes

Seed: roadmap slice **S-03 `inline-edit-and-delete-note`** (`context/foundation/roadmap.md`), Stream A "Podstawowa pętla notatki".

- **Outcome:** user w liście notatek edytuje treść notatki oraz przypisanie tagów bezpośrednio inline (bez nawigacji do osobnego widoku); user może definitywnie usunąć notatkę po potwierdzeniu w dialogu.
- **PRD refs:** FR-006, FR-007, FR-008; Guardrail #2 (Trwałość notatek).
- **Prerequisites:** S-01 `capture-note-with-tag` (done — service/API/island CRUD-create + read ustalony).
- **Parallel with:** S-02, S-04, S-05.
- **Risk:** inline-edit + delete-dialog dotykają tego samego wiersza — konflikt UX (klik = edit vs. klik = delete). Rozwiązanie: jawne przyciski Edit/Delete per wiersz (bez whole-row click). Twardy delete świadomie (brak kosza) — AlertDialog jest minimalnym zabezpieczeniem (FR-008).
