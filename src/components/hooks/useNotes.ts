import { useCallback, useState } from "react";
import type { CreateNoteResponse, NoteWithTags, Tag, UpdateNoteDTO, UpdateNoteResponse } from "@/types";

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Non-JSON error body; keep the default message.
  }
  return fallback;
}

function mergeTags(prev: Tag[], incoming: Tag[]): Tag[] {
  const byId = new Map(prev.map((tag) => [tag.id, tag]));
  for (const tag of incoming) {
    byId.set(tag.id, tag);
  }
  return Array.from(byId.values());
}

// Owns the notes + tags client state for the capture island. Seeded from server-fetched
// initial data; mutations await the server then update in place (create prepends, update
// replaces by id, delete removes) so the list stays truthful without a refetch.
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
      throw new Error(await readApiError(res, "Failed to save note"));
    }

    const data = (await res.json()) as CreateNoteResponse;

    setNotes((prev) => [data.note, ...prev]);
    setTags((prev) => mergeTags(prev, data.note.tags));

    return data;
  }, []);

  const updateNote = useCallback(async (noteId: string, patch: UpdateNoteDTO): Promise<UpdateNoteResponse> => {
    const res = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      throw new Error(await readApiError(res, "Failed to update note"));
    }

    const data = (await res.json()) as UpdateNoteResponse;

    setNotes((prev) => prev.map((note) => (note.id === noteId ? data.note : note)));
    setTags((prev) => mergeTags(prev, data.note.tags));

    return data;
  }, []);

  const deleteNote = useCallback(async (noteId: string): Promise<void> => {
    const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });

    if (!res.ok) {
      throw new Error(await readApiError(res, "Failed to delete note"));
    }

    setNotes((prev) => prev.filter((note) => note.id !== noteId));
  }, []);

  return { notes, tags, createNote, updateNote, deleteNote };
}
