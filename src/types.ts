// Shared domain types for MyNotes.
// Entities mirror the SQL schema in supabase/migrations/*_notes_tags_note_tags_schema_rls.sql
// exactly (uuid -> string, timestamptz -> ISO string). DTOs describe the shapes the
// data API accepts/returns. Slice S-01 (capture-note-with-tag) owns the note create/read
// contract below (JSON + zod-validated); S-03 owns note updates.

export interface Note {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface NoteTag {
  note_id: string;
  tag_id: string;
  user_id: string;
  created_at: string;
}

// S-01 create contract: the client sends tag *names* (not ids); the server resolves each
// name case-insensitively to an existing tag or creates it in-flow (FR-009).
export interface CreateNoteDTO {
  content: string;
  tagNames: string[];
}

// Read shape for the flat newest-first list: a note plus its attached tags (FR-005/010).
export interface NoteWithTags extends Note {
  tags: Tag[];
}

// Create response: makes the note-first partial-success contract explicit (Guardrail #2).
// tagsAttached === false means the note was saved but the tag/link step failed.
export interface CreateNoteResponse {
  note: NoteWithTags;
  tagsAttached: boolean;
}

// S-03 owns note updates; kept as-is for now.
export interface UpdateNoteDTO {
  content?: string;
  tagIds?: string[];
}

export interface CreateTagDTO {
  name: string;
}
