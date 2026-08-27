import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiContent, AiContentWithTag } from "@/types";
import { chatCompletion } from "@/lib/services/llm";

const PROMPT_SIZE_LIMIT = 50_000;

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

interface NoteRow {
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
    .order("created_at", { ascending: true });

  if (since) {
    query = query.gt("created_at", since);
  }

  const result = await query;

  if (result.error) {
    throw new Error(`Failed to fetch notes for tag: ${result.error.message}`);
  }
  return result.data;
}

function buildUserPrompt(notes: NoteRow[], truncatedCount: number): string {
  const header =
    truncatedCount > 0
      ? `Note: ${truncatedCount} oldest note(s) were omitted because total content exceeded the size limit.\n\n`
      : "";

  const noteBodies = notes.map((n, i) => `--- Note ${i + 1} (${n.created_at}) ---\n${n.content}`).join("\n\n");

  return `${header}${noteBodies}`;
}

function truncateNotes(notes: NoteRow[]): { kept: NoteRow[]; truncatedCount: number } {
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

  return { kept, truncatedCount: notes.length - kept.length };
}

export async function generateDigest(supabase: SupabaseClient, userId: string, tagId: string): Promise<AiContent> {
  const lastDigest = await fetchLastDigestForTag(supabase, userId, tagId);
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

export async function listDigests(supabase: SupabaseClient, userId: string): Promise<AiContentWithTag[]> {
  const result = await supabase
    .from("ai_content")
    .select("*, tags:source_tag_id(name)")
    .eq("user_id", userId)
    .eq("kind", "digest")
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new Error(`Failed to list digests: ${result.error.message}`);
  }

  return (result.data as unknown as AiContentJoinRow[]).map((row) => {
    const { tags: joinedTag, ...rest } = row;
    return { ...rest, tag_name: joinedTag?.name ?? null };
  });
}
