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
