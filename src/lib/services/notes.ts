import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateNoteDTO, CreateNoteResponse, NoteWithTags, Tag } from "@/types";

// Data-layer service for notes + tags. API routes stay thin and delegate here so every
// downstream slice (S-02..S-05) reuses the same reads/writes. All functions take an
// RLS-scoped Supabase client plus the resolved userId; user_id is always server-set from
// the session (never trusted from the client) to satisfy RLS and the composite owner FKs.

interface NoteTagJoinRow {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  note_tags: { tags: Tag | null }[] | null;
}

function flattenNoteRow(row: NoteTagJoinRow): NoteWithTags {
  const { note_tags, ...note } = row;
  const tags = (note_tags ?? []).map((link) => link.tags).filter((tag): tag is Tag => tag !== null);
  return { ...note, tags };
}

// Newest-first flat list of the user's notes with their attached tags (FR-005/010).
// Relies on the notes(user_id, created_at desc) index; tags are joined via note_tags.
export async function listNotesWithTags(supabase: SupabaseClient, userId: string): Promise<NoteWithTags[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, user_id, content, created_at, updated_at, note_tags(tags(*))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list notes: ${error.message}`);
  }

  return (data as unknown as NoteTagJoinRow[]).map(flattenNoteRow);
}

// All of the user's tags, for the typeahead suggestion source.
export async function listTags(supabase: SupabaseClient, userId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to list tags: ${error.message}`);
  }

  return data as Tag[];
}

// Resolve a set of tag names to Tag rows, creating any that don't yet exist for this user.
// Case-insensitive and set-based: names are collapsed by lower(name) so "Ideas" and "ideas"
// resolve to a single tag (matching the tags(user_id, lower(name)) unique index); original
// casing of the first occurrence is preserved when creating a new tag.
async function findOrCreateTags(supabase: SupabaseClient, userId: string, tagNames: string[]): Promise<Tag[]> {
  // Collapse by lower(name); first occurrence wins for the stored casing.
  const wantedByLower = new Map<string, string>();
  for (const raw of tagNames) {
    const name = raw.trim();
    if (name.length === 0) continue;
    const key = name.toLowerCase();
    if (!wantedByLower.has(key)) {
      wantedByLower.set(key, name);
    }
  }

  if (wantedByLower.size === 0) {
    return [];
  }

  // Fetch the user's existing tags once (MVP scale) and match case-insensitively.
  const existing = await listTags(supabase, userId);
  const existingByLower = new Map<string, Tag>();
  for (const tag of existing) {
    existingByLower.set(tag.name.toLowerCase(), tag);
  }

  const resolved: Tag[] = [];
  const toCreate: { user_id: string; name: string }[] = [];
  for (const [key, name] of wantedByLower) {
    const found = existingByLower.get(key);
    if (found) {
      resolved.push(found);
    } else {
      toCreate.push({ user_id: userId, name });
    }
  }

  if (toCreate.length > 0) {
    const { data, error } = await supabase.from("tags").insert(toCreate).select("*");
    if (error) {
      throw new Error(`Failed to create tags: ${error.message}`);
    }
    resolved.push(...(data as Tag[]));
  }

  return resolved;
}

// Create a note with its tags, enforcing note-first write ordering (Guardrail #2).
// The note row is inserted first and treated as committed truth. Only then are tags
// resolved/created and note_tags links inserted. If the tag/link step fails, the saved
// note is still returned with tagsAttached: false — the note is never lost.
export async function createNoteWithTags(
  supabase: SupabaseClient,
  userId: string,
  { content, tagNames }: CreateNoteDTO,
): Promise<CreateNoteResponse> {
  const noteInsert = await supabase.from("notes").insert({ user_id: userId, content }).select("*").single();

  if (noteInsert.error || !noteInsert.data) {
    throw new Error(`Failed to create note: ${noteInsert.error?.message ?? "no row returned"}`);
  }

  const note = noteInsert.data as NoteWithTags;
  note.tags = [];

  try {
    const tags = await findOrCreateTags(supabase, userId, tagNames);

    if (tags.length > 0) {
      const links = tags.map((tag) => ({
        note_id: note.id,
        tag_id: tag.id,
        user_id: userId,
      }));
      const { error: linkError } = await supabase.from("note_tags").insert(links);
      if (linkError) {
        throw new Error(`Failed to link tags: ${linkError.message}`);
      }
    }

    note.tags = tags;
    return { note, tagsAttached: true };
  } catch {
    // Note-first ordering: the note is already saved. Surface the partial success rather
    // than discarding the note (Guardrail #2).
    note.tags = [];
    return { note, tagsAttached: false };
  }
}
