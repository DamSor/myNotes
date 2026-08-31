import { handle } from "@astrojs/cloudflare/handler";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENROUTER_API_KEY: string;
  ASSETS: Fetcher;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handle(request, env, ctx);
  },
  scheduled(controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // eslint-disable-next-line no-console -- intentional heartbeat log for cron trigger verification
    console.log("weekly-summary cron fired", controller.cron, new Date().toISOString());
  },
} satisfies ExportedHandler<Env>;
