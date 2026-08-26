import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { json } from "@/lib/http";
import { updateNoteSchema } from "@/lib/validation/notes";
import { deleteNote, updateNoteWithTags } from "@/lib/services/notes";

export const prerender = false;

const uuidSchema = z.uuid();

// PATCH /api/notes/:id — partial update of content and/or tags (names resolved server-side).
// DELETE /api/notes/:id — hard-delete the note; note_tags links cascade at the DB.
export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const id = context.params.id;
  if (!id || !uuidSchema.safeParse(id).success) {
    return json({ error: "Note not found" }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = updateNoteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  try {
    const result = await updateNoteWithTags(supabase, user.id, id, parsed.data);
    if (result === null) {
      return json({ error: "Note not found" }, 404);
    }
    return json(result, 200);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("PATCH /api/notes/:id failed", e);
    return json({ error: "Failed to update note" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const id = context.params.id;
  if (!id || !uuidSchema.safeParse(id).success) {
    return json({ error: "Note not found" }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  try {
    const deleted = await deleteNote(supabase, user.id, id);
    if (!deleted) {
      return json({ error: "Note not found" }, 404);
    }
    return json({ id }, 200);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("DELETE /api/notes/:id failed", e);
    return json({ error: "Failed to delete note" }, 500);
  }
};
