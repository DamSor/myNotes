import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const redirectTo = new URL("/auth/callback", context.url.origin).href;

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error || !data.url) {
      const message = error?.message ?? "Failed to start Google sign-in";
      return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
    }

    return context.redirect(data.url);
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("POST /api/auth/signin failed", e);
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Failed to start Google sign-in")}`);
  }
};
