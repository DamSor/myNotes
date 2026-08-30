// Shared domain types for MyNotes.
// Entities mirror the SQL schema in supabase/migrations/*_notes_tags_note_tags_schema_rls.sql
// exactly (uuid -> string, timestamptz -> ISO string). DTOs describe the shapes the
// data API accepts/returns. Slice S-01 (capture-note-with-tag) owns the note create/read
// contract below (JSON + zod-validated); S-03 owns the note update contract (partial PATCH
// with tagNames, mirroring create).

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

// S-03 update contract: partial PATCH. Each field is optional; omitted fields are left
// unchanged. When tagNames is present it is the full desired set (same name-based
// resolution as create); an explicit [] clears all tags. Empty {} is a no-op.
export interface UpdateNoteDTO {
  content?: string;
  tagNames?: string[];
}

// Update response: content-first partial-success (Guardrail #2). tagsAttached === false
// means the content (if sent) was saved but the tag-link re-sync failed.
export interface UpdateNoteResponse {
  note: NoteWithTags;
  tagsAttached: boolean;
}

export interface CreateTagDTO {
  name: string;
}

// S-02 AI content entity: mirrors the ai_content table in
// supabase/migrations/*_ai_content_table.sql (uuid -> string, timestamptz -> ISO string).
// S-06 adds deleted_at for soft-delete / 70% acceptance signals.
export interface AiContent {
  id: string;
  user_id: string;
  source_tag_id: string | null;
  kind: "digest" | "weekly";
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Extended shape for the /ai list: includes the source tag name for display.
export interface AiContentWithTag extends AiContent {
  tag_name: string | null;
}

// S-02 digest generation DTO: the client sends the tag_id to digest.
export interface CreateDigestDTO {
  tagId: string;
}

// S-06 update contract: body-only PATCH. Body is required (the only editable field)
// and must be trimmed non-empty at the route layer.
export interface UpdateAiContentDTO {
  body: string;
}

// Update response: returns the updated row with tag name for display.
export interface UpdateAiContentResponse {
  aiContent: AiContentWithTag;
}

// F-02 LLM wrapper contract: prompt-agnostic chat completion shapes consumed by
// S-02 (digest) and S-08 (weekly summary). The wrapper lives in src/lib/services/llm.ts.
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmCompletion {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
