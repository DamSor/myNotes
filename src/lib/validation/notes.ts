import { z } from "zod";

// Single source of truth for validating note-create input (reused by POST /api/notes).
// Content is trimmed and required non-empty (empty notes are junk, FR-004); internal
// newlines are preserved. Tag names are trimmed and blanks dropped here; the
// case-insensitive collapse + set-dedupe against existing tags happens in the service,
// where find-or-create resolves each name against lower(name).
export const createNoteSchema = z.object({
  content: z.string().trim().min(1, "Content is required"),
  tagNames: z
    .array(z.string().trim())
    .default([])
    .transform((names) => names.filter((name) => name.length > 0)),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

// Single source of truth for validating note-update input (reused by PATCH /api/notes/:id).
// Both fields optional: a partial update. When content is present it is trimmed and
// required non-empty (FR-004). Tag names are trimmed and blanks dropped, matching create;
// an explicit [] is a valid "clear all tags". An empty object is a valid no-op.
export const updateNoteSchema = z.object({
  content: z.string().trim().min(1, "Content is required").optional(),
  tagNames: z
    .array(z.string().trim())
    .transform((names) => names.filter((name) => name.length > 0))
    .optional(),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
