import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { listTags } from "@/lib/services/notes";

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// GET /api/tags — the caller's tags, used as the typeahead suggestion source.
// No `q` filtering at MVP scale; the client filters the in-memory list.
export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  const tags = await listTags(supabase, user.id);
  return json(tags, 200);
};
