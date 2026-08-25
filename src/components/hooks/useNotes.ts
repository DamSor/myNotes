import { useCallback, useState } from "react";
import type { CreateNoteResponse, NoteWithTags, Tag } from "@/types";

// Owns the notes + tags client state for the capture island. Seeded from server-fetched
// initial data; on create it awaits the real returned row and prepends it (keeping the
// newest-first invariant) and merges any newly created tags into the tag list so later
// typeahead reflects them (F2).
export function useNotes(initialNotes: NoteWithTags[], initialTags: Tag[]) {
  const [notes, setNotes] = useState<NoteWithTags[]>(initialNotes);
  const [tags, setTags] = useState<Tag[]>(initialTags);

  const createNote = useCallback(async (content: string, tagNames: string[]): Promise<CreateNoteResponse> => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, tagNames }),
    });

    if (!res.ok) {
      let message = "Failed to save note";
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Non-JSON error body; keep the default message.
      }
      throw new Error(message);
    }

    const data = (await res.json()) as CreateNoteResponse;

    setNotes((prev) => [data.note, ...prev]);
    setTags((prev) => {
      const byId = new Map(prev.map((tag) => [tag.id, tag]));
      for (const tag of data.note.tags) {
        byId.set(tag.id, tag);
      }
      return Array.from(byId.values());
    });

    return data;
  }, []);

  return { notes, tags, createNote };
}
