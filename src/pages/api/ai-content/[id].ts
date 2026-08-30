import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { json } from "@/lib/http";
import { updateAiContentSchema } from "@/lib/validation/digest";
import { softDeleteAiContent, updateAiContent } from "@/lib/services/digest";

export const prerender = false;

const uuidSchema = z.uuid();

// PATCH /api/ai-content/:id — body-only update of any ai_content row the user owns.
// DELETE /api/ai-content/:id — soft-delete (sets deleted_at); row stays for metric queries.
export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const id = context.params.id;
  if (!id || !uuidSchema.safeParse(id).success) {
    return json({ error: "AI content not found" }, 404);
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

  const parsed = updateAiContentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  try {
    const aiContent = await updateAiContent(supabase, user.id, id, parsed.data);
    if (aiContent === null) {
      return json({ error: "AI content not found" }, 404);
    }
    return json({ aiContent }, 200);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("PATCH /api/ai-content/:id failed", e);
    return json({ error: "Failed to update AI content" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const id = context.params.id;
  if (!id || !uuidSchema.safeParse(id).success) {
    return json({ error: "AI content not found" }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  try {
    const deleted = await softDeleteAiContent(supabase, user.id, id);
    if (!deleted) {
      return json({ error: "AI content not found" }, 404);
    }
    return json({ id }, 200);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("DELETE /api/ai-content/:id failed", e);
    return json({ error: "Failed to delete AI content" }, 500);
  }
};
