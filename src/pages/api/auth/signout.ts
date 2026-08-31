import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // eslint-disable-next-line no-console -- intentional server-side error log
      console.error("POST /api/auth/signout failed", e);
    }
  }
  return context.redirect("/");
};
