import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { json } from "@/lib/http";
import { createNoteSchema } from "@/lib/validation/notes";
import { createNoteWithTags, listNotesWithTags } from "@/lib/services/notes";

export const prerender = false;

// POST /api/notes — create a plain-text note with tags (names resolved server-side).
// GET  /api/notes — list the caller's notes newest-first, each with its tags.
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
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

  const parsed = createNoteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  try {
    const result = await createNoteWithTags(supabase, user.id, parsed.data);
    return json(result, 201);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("POST /api/notes failed", e);
    return json({ error: "Failed to create note" }, 500);
  }
};

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  try {
    const notes = await listNotesWithTags(supabase, user.id);
    return json(notes, 200);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("GET /api/notes failed", e);
    return json({ error: "Failed to list notes" }, 500);
  }
};
