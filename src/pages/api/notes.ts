import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createNoteSchema } from "@/lib/validation/notes";
import { createNoteWithTags, listNotesWithTags } from "@/lib/services/notes";

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

  const result = await createNoteWithTags(supabase, user.id, parsed.data);
  return json(result, 201);
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

  const notes = await listNotesWithTags(supabase, user.id);
  return json(notes, 200);
};
