import { handle } from "@astrojs/cloudflare/handler";
import { createAdminClient } from "@/lib/supabase-admin";
import { generateWeeklySummaryForUser, hasWeeklySummaryInWindow } from "@/lib/services/weekly-summary";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENROUTER_API_KEY: string;
  ASSETS: Fetcher;
}

async function runWeeklySummaries(env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.OPENROUTER_API_KEY) {
    // eslint-disable-next-line no-console -- intentional: surface missing config
    console.error(
      "weekly-summary: missing required env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENROUTER_API_KEY)",
    );
    return;
  }

  const startMs = Date.now();
  const supabase = createAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // PostgREST doesn't support GROUP BY HAVING — group client-side (fine at MVP scale).
  const result = await supabase.from("notes").select("user_id").gt("created_at", windowStart);

  if (result.error) {
    // eslint-disable-next-line no-console -- intentional: surface query failure
    console.error("weekly-summary: failed to query notes", result.error.message);
    return;
  }

  const counts = new Map<string, number>();
  for (const row of result.data as { user_id: string }[]) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  const eligibleUserIds = [...counts.entries()].filter(([, count]) => count >= 3).map(([userId]) => userId);

  // eslint-disable-next-line no-console -- intentional: cron run visibility
  console.log(`weekly-summary: ${eligibleUserIds.length} eligible user(s) found`);

  for (const userId of eligibleUserIds) {
    try {
      const alreadyExists = await hasWeeklySummaryInWindow(supabase, userId, windowStart);
      if (alreadyExists) {
        // eslint-disable-next-line no-console -- intentional: idempotency trace
        console.log(`weekly-summary: skipping user ${userId} (already has summary in window)`);
        continue;
      }

      await generateWeeklySummaryForUser(supabase, userId, windowStart, env.OPENROUTER_API_KEY);
      // eslint-disable-next-line no-console -- intentional: success trace
      console.log(`weekly-summary: generated for user ${userId}`);
    } catch (e) {
      // eslint-disable-next-line no-console -- intentional: per-user error isolation
      console.error(`weekly-summary: failed for user ${userId}`, e);
    }
  }

  const elapsed = Date.now() - startMs;
  // eslint-disable-next-line no-console -- intentional: CPU budget monitoring for Free-tier
  console.log(`weekly-summary: completed in ${elapsed}ms wall-clock`);
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handle(request, env, ctx);
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runWeeklySummaries(env));
  },
} satisfies ExportedHandler<Env>;
