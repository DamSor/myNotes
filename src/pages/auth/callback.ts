import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const oauthError = context.url.searchParams.get("error");
  const oauthErrorDescription = context.url.searchParams.get("error_description");
  if (oauthError) {
    const message = oauthErrorDescription ?? oauthError;
    return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
  }

  const code = context.url.searchParams.get("code");
  if (!code) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Missing authorization code")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("GET /auth/callback failed", e);
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Sign-in failed")}`);
  }

  return context.redirect("/notes");
};
