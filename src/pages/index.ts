import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ locals, redirect }) => {
  if (locals.user) {
    return redirect("/notes");
  }
  return redirect("/auth/signin");
};
