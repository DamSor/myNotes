// Shared domain types for MyNotes.
// Entities mirror the SQL schema in supabase/migrations/*_notes_tags_note_tags_schema_rls.sql
// exactly (uuid -> string, timestamptz -> ISO string). DTOs describe the shapes the
// S-01 API layer will accept; that slice owns the final zod-validated contract.

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

export interface CreateNoteDTO {
  content: string;
  tagIds?: string[];
}

export interface UpdateNoteDTO {
  content?: string;
  tagIds?: string[];
}

export interface CreateTagDTO {
  name: string;
}
