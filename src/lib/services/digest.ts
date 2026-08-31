import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiContent, AiContentWithTag, UpdateAiContentDTO } from "@/types";
import { chatCompletion, isLlmConfigured } from "@/lib/services/llm";

const PROMPT_SIZE_LIMIT = 50_000;

// Cap the note fetch so a heavily-used tag can't blow the Cloudflare Free 10ms CPU
// budget (unbounded fetch + full-set iteration in truncateNotes). Newest N notes.
const NOTE_FETCH_LIMIT = 200;

const SYSTEM_PROMPT = `You are an assistant that creates structured digests from the user's personal notes.

RULES — follow them strictly:
1. Base your output EXCLUSIVELY on the notes provided below. Do not add facts, opinions, or references that are not present in the notes.
2. If a section has no supporting material in the notes, write "brak materiału" for that section — never invent content.
3. Write in the same language the notes are written in.

OUTPUT FORMAT — use exactly these four sections:

## Tematy
Key themes and recurring topics across the notes.

## Kluczowe decyzje
Decisions made or implied in the notes.

## Otwarte wątki
Questions, unresolved topics, or threads that need follow-up.

## Sprzeczności
Contradictions or tensions between different notes (if any).`;

export interface NoteRow {
  id: string;
  content: string;
  created_at: string;
}

export class DigestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = "DigestError";
    this.statusCode = statusCode;
  }
}

async function fetchLastDigestForTag(
  supabase: SupabaseClient,
  userId: string,
  tagId: string,
): Promise<AiContent | null> {
  const result = await supabase
    .from("ai_content")
    .select("*")
    .eq("user_id", userId)
    .eq("source_tag_id", tagId)
    .eq("kind", "digest")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Failed to fetch last digest: ${result.error.message}`);
  }
  return result.data as AiContent | null;
}

async function fetchNotesSinceForTag(
  supabase: SupabaseClient,
  userId: string,
  tagId: string,
  since: string | null,
): Promise<NoteRow[]> {
  let query = supabase
    .from("notes")
    .select("id, content, created_at, note_tags!inner(tag_id)")
    .eq("user_id", userId)
    .eq("note_tags.tag_id", tagId)
    .order("created_at", { ascending: false })
    .limit(NOTE_FETCH_LIMIT);

  if (since) {
    query = query.gt("created_at", since);
  }

  const result = await query;

  if (result.error) {
    throw new Error(`Failed to fetch notes for tag: ${result.error.message}`);
  }
  // Fetched newest-first for the bound; reverse back to chronological for the prompt.
  return (result.data as NoteRow[]).reverse();
}

export function buildUserPrompt(notes: NoteRow[], truncatedCount: number): string {
  const header =
    truncatedCount > 0
      ? `Note: ${truncatedCount} oldest note(s) were omitted because total content exceeded the size limit.\n\n`
      : "";

  const noteBodies = notes.map((n, i) => `--- Note ${i + 1} (${n.created_at}) ---\n${n.content}`).join("\n\n");

  return `${header}${noteBodies}`;
}

export function truncateNotes(notes: NoteRow[]): { kept: NoteRow[]; truncatedCount: number } {
  let totalChars = 0;
  for (const n of notes) {
    totalChars += n.content.length;
  }

  if (totalChars <= PROMPT_SIZE_LIMIT) {
    return { kept: notes, truncatedCount: 0 };
  }

  const kept: NoteRow[] = [];
  let size = 0;
  for (let i = notes.length - 1; i >= 0; i--) {
    if (size + notes[i].content.length <= PROMPT_SIZE_LIMIT) {
      kept.unshift(notes[i]);
      size += notes[i].content.length;
    } else {
      break;
    }
  }

  // Guarantee at least the newest note survives — if it alone exceeds the limit,
  // hard-truncate its content so the prompt is never empty.
  if (kept.length === 0) {
    const newest = notes[notes.length - 1];
    kept.push({ ...newest, content: newest.content.slice(0, PROMPT_SIZE_LIMIT) });
    return { kept, truncatedCount: notes.length - 1 };
  }

  return { kept, truncatedCount: notes.length - kept.length };
}

export async function generateDigest(supabase: SupabaseClient, userId: string, tagId: string): Promise<AiContent> {
  if (!isLlmConfigured()) {
    throw new DigestError("AI is not configured. Set OPENROUTER_API_KEY to generate digests.", 503);
  }

  const lastDigest = await fetchLastDigestForTag(supabase, userId, tagId);
  // MVP limitation: the window watermark is the previous digest's created_at, which is
  // set at INSERT (after the up-to-25s LLM call). Notes written during the
  // fetch→LLM→insert window fall before that timestamp and are never re-digested.
  // Accepted for MVP alongside "edited notes aren't re-digested". Follow-up: covered_until column.
  const since = lastDigest?.created_at ?? null;

  const allNotes = await fetchNotesSinceForTag(supabase, userId, tagId, since);

  if (allNotes.length === 0) {
    const reason = since ? "No new notes since the last digest for this tag." : "No notes found for this tag.";
    throw new DigestError(reason);
  }

  const { kept, truncatedCount } = truncateNotes(allNotes);
  const userPrompt = buildUserPrompt(kept, truncatedCount);

  const completion = await chatCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ]);

  const insertResult = await supabase
    .from("ai_content")
    .insert({
      user_id: userId,
      source_tag_id: tagId,
      kind: "digest",
      body: completion.text,
    })
    .select("*")
    .single();

  if (insertResult.error || !insertResult.data) {
    throw new Error(`Failed to store digest: ${insertResult.error?.message ?? "no row returned"}`);
  }

  return insertResult.data as AiContent;
}

interface AiContentJoinRow extends AiContent {
  tags: { name: string } | null;
}

const AI_CONTENT_WITH_TAG_SELECT = "*, tags:source_tag_id(name)";

function flattenAiContentRow(row: AiContentJoinRow): AiContentWithTag {
  const { tags: joinedTag, ...rest } = row;
  return { ...rest, tag_name: joinedTag?.name ?? null };
}

async function readAiContentWithTag(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<AiContentWithTag | null> {
  const result = await supabase
    .from("ai_content")
    .select(AI_CONTENT_WITH_TAG_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Failed to read ai_content: ${result.error.message}`);
  }
  if (!result.data) {
    return null;
  }
  return flattenAiContentRow(result.data as AiContentJoinRow);
}

export async function listDigests(supabase: SupabaseClient, userId: string): Promise<AiContentWithTag[]> {
  const result = await supabase
    .from("ai_content")
    .select(AI_CONTENT_WITH_TAG_SELECT)
    .eq("user_id", userId)
    .eq("kind", "digest")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new Error(`Failed to list digests: ${result.error.message}`);
  }

  return (result.data as unknown as AiContentJoinRow[]).map(flattenAiContentRow);
}

// Body-only update for any ai_content row the user owns. Ownership is gated with a
// leading SELECT (id + user_id + not soft-deleted) so missing/foreign/deleted ids
// all return null for the route to map to 404. updated_at is left to the trigger.
export async function updateAiContent(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  { body }: UpdateAiContentDTO,
): Promise<AiContentWithTag | null> {
  const owned = await supabase
    .from("ai_content")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (owned.error) {
    throw new Error(`Failed to load ai_content: ${owned.error.message}`);
  }
  if (!owned.data) {
    return null;
  }

  const { error } = await supabase.from("ai_content").update({ body }).eq("id", id).eq("user_id", userId);
  if (error) {
    throw new Error(`Failed to update ai_content: ${error.message}`);
  }

  const updated = await readAiContentWithTag(supabase, userId, id);
  if (!updated) {
    throw new Error("Failed to re-read ai_content: no row returned");
  }
  return updated;
}

// Soft-delete any ai_content row the user owns by setting deleted_at. Already-deleted
// or non-owned rows affect 0 rows so the route can map to 404. The set_updated_at
// trigger also fires; deleted rows are filtered from list queries so this is invisible.
export async function softDeleteAiContent(supabase: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_content")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw new Error(`Failed to delete ai_content: ${error.message}`);
  }

  return data.length > 0;
}
