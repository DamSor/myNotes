import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { json } from "@/lib/http";
import { createDigestSchema } from "@/lib/validation/digest";
import { generateDigest, listDigests, DigestError } from "@/lib/services/digest";

export const prerender = false;

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

  const parsed = createDigestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  try {
    const digest = await generateDigest(supabase, user.id, parsed.data.tagId);
    return json(digest, 201);
  } catch (e) {
    if (e instanceof DigestError) {
      return json({ error: e.message }, e.statusCode);
    }
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("POST /api/digests failed", e);
    return json({ error: "Failed to generate digest" }, 500);
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
    const digests = await listDigests(supabase, user.id);
    return json(digests, 200);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("GET /api/digests failed", e);
    return json({ error: "Failed to list digests" }, 500);
  }
};
