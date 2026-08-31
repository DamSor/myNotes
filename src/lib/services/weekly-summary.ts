import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiContent } from "@/types";
import { chatCompletion } from "@/lib/services/llm";
import { type NoteRow, truncateNotes, buildUserPrompt } from "@/lib/services/digest";

const NOTE_FETCH_LIMIT = 200;

const WEEKLY_FAILED_BODY = "Nie udało się wygenerować tygodniowego podsumowania za ten tydzień.";

const SYSTEM_PROMPT = `You are an assistant that creates structured weekly summaries from the user's personal notes.

RULES — follow them strictly:
1. Base your output EXCLUSIVELY on the notes provided below. Do not add facts, opinions, or references that are not present in the notes.
2. If a section has no supporting material in the notes, write "brak materiału" for that section — never invent content.
3. Write in the same language the notes are written in.

OUTPUT FORMAT — use exactly these four sections:

## Tematy
Key themes and recurring topics across all notes from the past week.

## Kluczowe decyzje
Decisions made or implied in the notes during the week.

## Otwarte wątki
Questions, unresolved topics, or threads that need follow-up.

## Sprzeczności
Contradictions or tensions between different notes (if any).`;

async function fetchUserNotesInWindow(
  supabase: SupabaseClient,
  userId: string,
  windowStart: string,
): Promise<NoteRow[]> {
  const result = await supabase
    .from("notes")
    .select("id, content, created_at")
    .eq("user_id", userId)
    .gt("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(NOTE_FETCH_LIMIT);

  if (result.error) {
    throw new Error(`Failed to fetch notes for weekly summary: ${result.error.message}`);
  }

  return (result.data as NoteRow[]).reverse();
}

export async function hasWeeklySummaryInWindow(
  supabase: SupabaseClient,
  userId: string,
  windowStart: string,
): Promise<boolean> {
  const result = await supabase
    .from("ai_content")
    .select("id")
    .eq("user_id", userId)
    .in("kind", ["weekly", "weekly-failed"])
    .gt("created_at", windowStart)
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Failed to check weekly summary window: ${result.error.message}`);
  }

  return result.data !== null;
}

export async function generateWeeklySummaryForUser(
  supabase: SupabaseClient,
  userId: string,
  windowStart: string,
  openrouterApiKey: string,
): Promise<AiContent | null> {
  const notes = await fetchUserNotesInWindow(supabase, userId, windowStart);

  if (notes.length < 3) {
    return null;
  }

  const { kept, truncatedCount } = truncateNotes(notes);
  const userPrompt = buildUserPrompt(kept, truncatedCount);

  let completionText: string;
  try {
    const completion = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { apiKey: openrouterApiKey },
    );
    completionText = completion.text;
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional: surface LLM failure in server logs before writing fallback entry
    console.error("weekly-summary: LLM call failed for user", userId, e);

    await supabase.from("ai_content").insert({
      user_id: userId,
      source_tag_id: null,
      kind: "weekly-failed",
      body: WEEKLY_FAILED_BODY,
    });

    throw e;
  }

  const insertResult = await supabase
    .from("ai_content")
    .insert({
      user_id: userId,
      source_tag_id: null,
      kind: "weekly",
      body: completionText,
    })
    .select("*")
    .single();

  if (insertResult.error || !insertResult.data) {
    // eslint-disable-next-line no-console -- intentional: surface insert failure
    console.error("weekly-summary: insert failed for user", userId, insertResult.error?.message);

    await supabase.from("ai_content").insert({
      user_id: userId,
      source_tag_id: null,
      kind: "weekly-failed",
      body: WEEKLY_FAILED_BODY,
    });

    throw new Error(`Failed to store weekly summary: ${insertResult.error?.message ?? "no row returned"}`);
  }

  return insertResult.data as AiContent;
}
