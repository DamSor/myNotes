import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { json } from "@/lib/http";
import { listTags } from "@/lib/services/notes";

export const prerender = false;

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

  try {
    const tags = await listTags(supabase, user.id);
    return json(tags, 200);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("GET /api/tags failed", e);
    return json({ error: "Failed to list tags" }, 500);
  }
};
