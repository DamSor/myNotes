import type { APIRoute } from "astro";
import { oauthUserMessage } from "@/lib/oauth-error";
import { createClient } from "@/lib/supabase";

export const prerender = false;

/** Hash fragments never reach the server. Render this so the browser can lift `#error=` into `?error=`. */
const HASH_ERROR_BRIDGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Signing in…</title>
    <script>
      (function () {
        var params = new URLSearchParams(location.hash.replace(/^#/, ""));
        var code = params.get("error");
        var description = params.get("error_description");
        var message =
          code === "access_denied" || description === "access_denied"
            ? "Google sign-in was cancelled."
            : description || code;
        var target = message
          ? "/auth/signin?error=" + encodeURIComponent(message)
          : "/auth/signin?error=" + encodeURIComponent("Missing authorization code");
        location.replace(target);
      })();
    </script>
  </head>
  <body></body>
</html>`;

export const GET: APIRoute = async (context) => {
  const oauthError = context.url.searchParams.get("error")?.trim();
  const oauthErrorDescription = context.url.searchParams.get("error_description")?.trim();
  if (oauthError) {
    const message = oauthUserMessage(oauthError, oauthErrorDescription) ?? "Sign-in failed";
    return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
  }

  const code = context.url.searchParams.get("code");
  if (!code) {
    return new Response(HASH_ERROR_BRIDGE, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
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
